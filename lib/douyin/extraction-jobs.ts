import { ExtractionJobStatus, Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  logExtractionFailureDiagnostic,
  logExtractionJobLifecycleDiagnostic,
  summarizeExtractionJobObservation
} from "@/lib/douyin/diagnostics";
import {
  douyinTranscriptFailureMessage,
  douyinTranscriptProvider
} from "@/lib/douyin/transcript-provider";
import {
  extractionTranscriptEmptyErrorCode,
  normalizeCompletedExtractionTranscript,
  resolveExtractionCompletion
} from "@/lib/douyin/extraction-job-contract";
import { encodeExtractionErrorCode } from "@/lib/douyin/extraction-error-code";
import { extractDouyinUrl } from "@/lib/douyin/source-input";
import { getProjectForUser } from "@/lib/projects/service";
import {
  getExtractionUserConcurrencyLimit,
  shouldRetryExtractionFailure
} from "@/lib/douyin/extraction-worker-policy";

const defaultJobTimeoutMs = 5 * 60 * 1000;
const defaultJobTtlMs = 30 * 60 * 1000;
const defaultMaxAttempts = 3;
const defaultConcurrentJobsPerUser = 2;

export type SerializedExtractionJob = {
  id: string;
  status: ExtractionJobStatus;
  message?: string;
  originalTranscript?: string;
};

export class ExtractionJobError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function createExtractionJob({
  userId,
  projectId,
  douyinUrl
}: {
  userId: string;
  projectId?: string;
  douyinUrl: unknown;
}) {
  await cleanupExpiredExtractionJobs();

  const normalizedUrl = normalizeDouyinUrl(douyinUrl);
  const sourceSummary = summarizeSourceUrl(normalizedUrl);

  if (projectId) {
    const project = await getProjectForUser(projectId, userId);

    if (!project) {
      throw new ExtractionJobError("PROJECT_NOT_FOUND", "项目不存在", 404);
    }
  }

  const job = await createJobWithConcurrencyGuard({
    userId,
    projectId,
    normalizedUrl,
    sourceSummary
  });

  return serializeExtractionJob(job);
}

async function createJobWithConcurrencyGuard(input: {
  userId: string;
  projectId?: string;
  normalizedUrl: string;
  sourceSummary: { host: string; hash: string };
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const activeJobCount = await tx.extractionJob.count({
            where: { userId: input.userId, status: { in: ["queued", "processing"] } }
          });
          if (activeJobCount >= getConcurrentJobsPerUser()) {
            throw new ExtractionJobError(
              "EXTRACTION_CONCURRENCY_LIMIT",
              "当前已有提取任务正在处理，请稍后再试",
              429
            );
          }
          const job = await tx.extractionJob.create({
            data: {
              userId: input.userId,
              projectId: input.projectId,
              sourceUrl: input.normalizedUrl,
              sourceHost: input.sourceSummary.host,
              sourceHash: input.sourceSummary.hash,
              status: "queued",
              maxAttempts: getExtractionJobMaxAttempts(),
              availableAt: new Date(),
              expiresAt: new Date(Date.now() + getExtractionJobTtlMs())
            },
            select: jobSelect
          });

          logExtractionJobLifecycleDiagnostic(
            summarizeExtractionJobObservation({
              event: "douyin_extraction_job_created",
              userId: input.userId,
              job,
              activeJobCount
            })
          );

          return job;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new ExtractionJobError("EXTRACTION_CONCURRENCY_LIMIT", "当前已有提取任务正在处理，请稍后再试", 429);
}

export async function getExtractionJobForUser(jobId: string, userId: string) {
  const job = await prisma.extractionJob.findFirst({
    where: {
      id: jobId,
      userId
    },
    select: jobSelect
  });

  if (!job) {
    await cleanupExpiredExtractionJobs();
    throw new ExtractionJobError("EXTRACTION_JOB_NOT_FOUND", "任务不存在", 404);
  }

  logExtractionJobLifecycleDiagnostic(
    summarizeExtractionJobObservation({
      event: "douyin_extraction_job_observed",
      userId,
      job
    })
  );

  if (shouldMarkExpired(job)) {
    await clearExpiredExtractionJob(job.id);

    return {
      id: job.id,
      status: "failed",
      message: douyinTranscriptFailureMessage
    };
  }

  return serializeExtractionJob(job);
}

const jobSelect = {
  id: true,
  userId: true,
  projectId: true,
  sourceUrl: true,
  sourceHost: true,
  sourceHash: true,
  status: true,
  errorCode: true,
  transcript: true,
  attemptCount: true,
  maxAttempts: true,
  availableAt: true,
  lockedAt: true,
  lockedBy: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true
} as const;

type ExtractionJobRecord = {
  id: string;
  status: ExtractionJobStatus;
  errorCode: string | null;
  transcript: string | null;
  expiresAt: Date | null;
};

export async function processClaimedExtractionJob(
  jobId: string,
  workerId: string
) {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    select: jobSelect
  });

  if (
    !job ||
    job.status !== "processing" ||
    job.lockedBy !== workerId
  ) {
    return;
  }

  if (shouldMarkExpired(job)) {
    await clearExpiredExtractionJob(job.id);
    return;
  }

  if (!job.sourceUrl) {
    await prisma.extractionJob.updateMany({
      where: { id: job.id },
      data: {
        status: "failed",
        errorCode: "EXTRACTION_SOURCE_EXPIRED",
        sourceUrl: null,
        transcript: null,
        lockedAt: null,
        lockedBy: null
      }
    });
    return;
  }

  const result = await withTimeout(
    douyinTranscriptProvider(job.sourceUrl, job.userId),
    getExtractionJobTimeoutMs()
  );

  if (result.status === "success") {
    const completion = resolveExtractionCompletion(result.originalTranscript);

    if (completion.status === "failed") {
      logExtractionFailureDiagnostic({
        event: "douyin_extraction_failed",
        jobId: job.id,
        provider: "douyin",
        errorCode: extractionTranscriptEmptyErrorCode,
        sourceHost: job.sourceHost,
        sourceHash: job.sourceHash,
        diagnostic: {
          failureCategory: "response_unsupported",
          retryable: false
        }
      });

      await prisma.extractionJob.updateMany({
        where: {
          id: job.id,
          status: "processing",
          lockedBy: workerId
        },
        data: {
          status: "failed",
          errorCode: extractionTranscriptEmptyErrorCode,
          sourceUrl: null,
          transcript: null,
          lockedAt: null,
          lockedBy: null
        }
      });
      return;
    }

    await prisma.extractionJob.updateMany({
      where: { id: job.id },
      data: {
        status: "succeeded",
        errorCode: null,
        transcript: completion.originalTranscript,
        sourceUrl: null,
        lockedAt: null,
        lockedBy: null
      }
    });
    return;
  }

  if (
    shouldRetryExtractionFailure({
      errorCode: result.errorCode,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts
    })
  ) {
    await prisma.extractionJob.updateMany({
      where: {
        id: job.id,
        status: "processing",
        lockedBy: workerId
      },
      data: {
        status: "queued",
        errorCode: encodeExtractionErrorCode({
          errorCode: result.errorCode,
          diagnostic: result.diagnostic
        }),
        availableAt: new Date(Date.now() + getRetryDelayMs(job.attemptCount)),
        lockedAt: null,
        lockedBy: null,
        transcript: null
      }
    });
    return;
  }

  if (result.diagnostic) {
    logExtractionFailureDiagnostic({
      event: "douyin_extraction_failed",
      jobId: job.id,
      provider: result.diagnostic.provider,
      errorCode: result.errorCode,
      sourceHost: job.sourceHost,
      sourceHash: job.sourceHash,
      diagnostic: {
        failureCategory: result.diagnostic.failureCategory,
        failureReason: result.diagnostic.failureReason,
        attempts: result.diagnostic.attempts,
        httpStatus: result.diagnostic.httpStatus,
        retryable: result.diagnostic.retryable,
        requestId: result.diagnostic.requestId,
        normalizedUrlLength: result.diagnostic.normalizedUrlLength,
        normalizedUrlHash8: result.diagnostic.normalizedUrlHash8,
        responseBodyLength: result.diagnostic.responseBodyLength,
        responseBodyHash8: result.diagnostic.responseBodyHash8,
        selectedMediaKind: result.diagnostic.selectedMediaKind,
        selectedMediaFormat: result.diagnostic.selectedMediaFormat,
        selectedMediaPath: result.diagnostic.selectedMediaPath,
        candidateCount: result.diagnostic.candidateCount,
        candidateKinds: result.diagnostic.candidateKinds,
        candidateFormats: result.diagnostic.candidateFormats,
        candidatePaths: result.diagnostic.candidatePaths,
        relayUsed: result.diagnostic.relayUsed,
        relayFailureReason: result.diagnostic.relayFailureReason,
        relayDownloadStatusClass: result.diagnostic.relayDownloadStatusClass,
        relayContentType: result.diagnostic.relayContentType,
        relaySizeBucket: result.diagnostic.relaySizeBucket,
        relayDurationBucket: result.diagnostic.relayDurationBucket,
        relayObjectKeyHash8: result.diagnostic.relayObjectKeyHash8,
        relayCleanupResult: result.diagnostic.relayCleanupResult,
        relayRemoteDeleteAttempted:
          result.diagnostic.relayRemoteDeleteAttempted,
        relayRemoteDeleteResult: result.diagnostic.relayRemoteDeleteResult
      }
    });
  }

  await prisma.extractionJob.updateMany({
    where: {
      id: job.id,
      status: "processing",
      lockedBy: workerId
    },
    data: {
      status: "failed",
      errorCode: encodeExtractionErrorCode({
        errorCode: result.errorCode,
        diagnostic: result.diagnostic
      }),
      sourceUrl: null,
      transcript: null,
      lockedAt: null,
      lockedBy: null
    }
  });
}

async function serializeExtractionJob(
  job: ExtractionJobRecord
): Promise<SerializedExtractionJob> {
  if (job.status === "succeeded") {
    const transcript = normalizeCompletedExtractionTranscript(job.transcript);

    if (!transcript) {
      await prisma.extractionJob.updateMany({
        where: { id: job.id, status: "succeeded" },
        data: {
          status: "failed",
          errorCode: extractionTranscriptEmptyErrorCode,
          transcript: null
        }
      });

      return {
        id: job.id,
        status: "failed",
        message: douyinTranscriptFailureMessage
      };
    }

    return {
      id: job.id,
      status: job.status,
      originalTranscript: transcript
    };
  }

  if (job.status === "failed") {
    return {
      id: job.id,
      status: job.status,
      message: douyinTranscriptFailureMessage
    };
  }

  return {
    id: job.id,
    status: job.status
  };
}

function normalizeDouyinUrl(value: unknown) {
  const douyinUrl = extractDouyinUrl(value);

  if (!douyinUrl) {
    throw new ExtractionJobError(
      "INVALID_DOUYIN_URL",
      douyinTranscriptFailureMessage,
      400
    );
  }

  return douyinUrl;
}

function shouldMarkExpired(job: { expiresAt: Date | null }) {
  return Boolean(job.expiresAt && job.expiresAt.getTime() <= Date.now());
}

async function clearExpiredExtractionJob(jobId: string) {
  await prisma.extractionJob.deleteMany({
    where: { id: jobId }
  });
}

export async function cleanupExpiredExtractionJobs(now = new Date()) {
  await prisma.extractionJob.deleteMany({
    where: {
      expiresAt: {
        lte: now
      }
    }
  });
}

function summarizeSourceUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);

  return {
    host: url.hostname.toLowerCase(),
    hash: createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24)
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeout = setTimeout(() => {
      resolve({
        status: "failed",
        errorCode: "EXTRACTION_FAILED"
      } as T);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function getExtractionJobTimeoutMs() {
  return getPositiveInteger(
    process.env.EXTRACTION_JOB_TIMEOUT_MS,
    defaultJobTimeoutMs
  );
}

function getExtractionJobTtlMs() {
  return getPositiveInteger(process.env.EXTRACTION_JOB_TTL_MS, defaultJobTtlMs);
}

function getExtractionJobMaxAttempts() {
  return getPositiveInteger(
    process.env.EXTRACTION_JOB_MAX_ATTEMPTS,
    defaultMaxAttempts
  );
}

function getConcurrentJobsPerUser() {
  return getExtractionUserConcurrencyLimit(
    process.env.EXTRACTION_MAX_CONCURRENT_PER_USER ||
      String(defaultConcurrentJobsPerUser)
  );
}

function getRetryDelayMs(attemptCount: number) {
  return Math.min(15_000 * 2 ** Math.max(0, attemptCount - 1), 60_000);
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
