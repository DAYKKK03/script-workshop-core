import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  classifyExtractionClaimFailure,
  logExtractionClaimDiagnostic,
  logExtractionWorkerTick,
  summarizeTrackedExtractionJob
} from "@/lib/douyin/diagnostics";
import { processClaimedExtractionJob } from "@/lib/douyin/extraction-jobs";
import {
  canAttemptExtractionJob,
  getExtractionWorkerConcurrency
} from "@/lib/douyin/extraction-worker-policy";
import { enforceRetention } from "@/lib/maintenance/retention";

const defaultPollIntervalMs = 2_000;
const defaultLockTimeoutMs = 6 * 60 * 1000;
const defaultHeartbeatIntervalMs = 30_000;

export async function recoverStaleExtractionJobs(now = new Date()) {
  const staleBefore = new Date(now.getTime() - getLockTimeoutMs());
  const staleJobs = await prisma.extractionJob.findMany({
    where: {
      status: "processing",
      OR: [{ lockedAt: { lte: staleBefore } }, { expiresAt: { lte: now } }]
    },
    select: {
      id: true,
      attemptCount: true,
      maxAttempts: true,
      expiresAt: true
    }
  });
  const retryIds = staleJobs
    .filter(
      (job) =>
        Boolean(job.expiresAt && job.expiresAt > now) &&
        canAttemptExtractionJob(job)
    )
    .map((job) => job.id);
  const failedIds = staleJobs
    .filter(
      (job) =>
        !job.expiresAt ||
        job.expiresAt <= now ||
        !canAttemptExtractionJob(job)
    )
    .map((job) => job.id);

  if (retryIds.length > 0) {
    await prisma.extractionJob.updateMany({
      where: { id: { in: retryIds }, status: "processing" },
      data: {
        status: "queued",
        lockedAt: null,
        lockedBy: null,
        availableAt: now,
        errorCode: "EXTRACTION_WORKER_INTERRUPTED"
      }
    });
  }

  if (failedIds.length > 0) {
    await prisma.extractionJob.updateMany({
      where: { id: { in: failedIds }, status: "processing" },
      data: {
        status: "failed",
        errorCode: "EXTRACTION_WORKER_EXHAUSTED",
        sourceUrl: null,
        transcript: null,
        lockedAt: null,
        lockedBy: null
      }
    });
  }
}

export async function claimNextExtractionJob(workerId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const now = new Date();
      const candidates = await prisma.extractionJob.findMany({
        where: {
          status: "queued",
          availableAt: { lte: now },
          expiresAt: { gt: now }
        },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
        take: 25,
        select: {
          id: true,
          sourceHash: true,
          sourceHost: true,
          attemptCount: true,
          maxAttempts: true,
          availableAt: true,
          expiresAt: true
        }
      });
      const exhaustedCandidates = candidates.filter(
        (job) => !canAttemptExtractionJob(job)
      );
      const exhaustedIds = exhaustedCandidates.map((job) => job.id);

      const counts = await summarizeQueuedJobCounts(now);

      if (exhaustedIds.length > 0) {
        await prisma.extractionJob.updateMany({
          where: { id: { in: exhaustedIds }, status: "queued" },
          data: {
            status: "failed",
            errorCode: "EXTRACTION_WORKER_EXHAUSTED",
            sourceUrl: null,
            transcript: null,
            lockedAt: null,
            lockedBy: null
          }
        });
      }

      const candidate = candidates.find(canAttemptExtractionJob);

      if (!candidate) {
        logExtractionClaimDiagnostic({
          event: "douyin_extraction_claim",
          workerId,
          result: "skipped",
          failureCategory: classifyExtractionClaimFailure({
            candidateCount: candidates.length,
            counts,
            exhaustedCount: exhaustedCandidates.length
          }),
          claimAttempt: attempt + 1,
          candidateCount: candidates.length,
          dueCount: counts.dueCount,
          exhaustedCount: exhaustedCandidates.length,
          expiredCount: counts.expiredCount,
          notDueCount: counts.notDueCount,
          queuedTotal: counts.queuedTotal
        });
        return null;
      }

      const claimed = await prisma.extractionJob.updateMany({
        where: {
          id: candidate.id,
          status: "queued",
          availableAt: { lte: now },
          attemptCount: candidate.attemptCount
        },
        data: {
          status: "processing",
          lockedAt: now,
          lockedBy: workerId,
          attemptCount: { increment: 1 },
          errorCode: null
        }
      });

      if (claimed.count === 1) {
        logExtractionClaimDiagnostic({
          event: "douyin_extraction_claim",
          workerId,
          result: "claimed",
          claimAttempt: attempt + 1,
          candidateCount: candidates.length,
          dueCount: counts.dueCount,
          exhaustedCount: exhaustedCandidates.length,
          jobId: candidate.id,
          sourceHost: candidate.sourceHost,
          sourceHash: candidate.sourceHash,
          attemptCount: candidate.attemptCount,
          maxAttempts: candidate.maxAttempts,
          availableAtDue: candidate.availableAt <= now,
          expiresAtValid: Boolean(candidate.expiresAt && candidate.expiresAt > now)
        });
        return candidate.id;
      }

      logExtractionClaimDiagnostic({
        event: "douyin_extraction_claim",
        workerId,
        result: "contention_lost",
        failureCategory: "contention_lost",
        claimAttempt: attempt + 1,
        candidateCount: candidates.length,
        dueCount: counts.dueCount,
        exhaustedCount: exhaustedCandidates.length,
        jobId: candidate.id,
        sourceHost: candidate.sourceHost,
        sourceHash: candidate.sourceHash,
        attemptCount: candidate.attemptCount,
        maxAttempts: candidate.maxAttempts,
        availableAtDue: candidate.availableAt <= now,
        expiresAtValid: Boolean(candidate.expiresAt && candidate.expiresAt > now)
      });
    } catch (error) {
      logExtractionClaimDiagnostic({
        event: "douyin_extraction_claim",
        workerId,
        result: "db_error",
        failureCategory: "db_error",
        claimAttempt: attempt + 1,
        candidateCount: 0,
        dueCount: 0,
        exhaustedCount: 0,
        errorName: error instanceof Error ? error.name : "UnknownError"
      });
      throw error;
    }
  }

  return null;
}

const defaultRecoveryIntervalMs = 30_000; // 30 seconds

export async function runExtractionWorker(options?: {
  signal?: AbortSignal;
  workerId?: string;
}) {
  const workerId = options?.workerId || `worker-${randomUUID()}`;
  const concurrency = getExtractionWorkerConcurrency(
    process.env.EXTRACTION_WORKER_CONCURRENCY || "2"
  );
  const active = new Set<Promise<void>>();
  let nextMaintenanceAt = Date.now();
  let nextRecoveryAt = Date.now();
  let nextHeartbeatAt = Date.now();

  await recoverStaleExtractionJobs();

  while (!options?.signal?.aborted) {
    if (Date.now() >= nextHeartbeatAt) {
      const counts = await summarizeQueuedJobCounts(new Date());
      logExtractionWorkerTick({
        event: "douyin_extraction_worker_tick",
        workerId,
        concurrency,
        activeCount: active.size,
        queuedTotal: counts.queuedTotal,
        dueCount: counts.dueCount,
        expiredCount: counts.expiredCount,
        notDueCount: counts.notDueCount,
        oldestQueuedJob: counts.oldestQueuedJob,
        oldestDueJob: counts.oldestDueJob
      });
      nextHeartbeatAt = Date.now() + getHeartbeatIntervalMs();
    }

    // Periodic stale job recovery (prevents stuck jobs from worker crashes)
    if (Date.now() >= nextRecoveryAt) {
      await recoverStaleExtractionJobs().catch(() => undefined);
      nextRecoveryAt = Date.now() + getRecoveryIntervalMs();
    }

    if (Date.now() >= nextMaintenanceAt) {
      await enforceRetention().catch(() => undefined);
      nextMaintenanceAt = Date.now() + 24 * 60 * 60 * 1000;
    }
    while (active.size < concurrency) {
      const jobId = await claimNextExtractionJob(workerId);

      if (!jobId) break;

      const task = processClaimedExtractionJob(jobId, workerId)
        .catch(() => undefined)
        .finally(() => active.delete(task));
      active.add(task);
    }

    if (active.size === 0) {
      await sleep(getPollIntervalMs(), options?.signal);
    } else if (active.size >= concurrency) {
      await Promise.race(active);
    } else {
      await sleep(250, options?.signal);
    }
  }

  await Promise.allSettled(active);
}

function getPollIntervalMs() {
  return getPositiveInteger(
    process.env.EXTRACTION_WORKER_POLL_INTERVAL_MS || process.env.EXTRACTION_WORKER_POLL_MS,
    defaultPollIntervalMs
  );
}

function getLockTimeoutMs() {
  return getPositiveInteger(
    process.env.EXTRACTION_WORKER_LOCK_TIMEOUT_MS || process.env.EXTRACTION_LOCK_TIMEOUT_MS,
    defaultLockTimeoutMs
  );
}

function getRecoveryIntervalMs() {
  return getPositiveInteger(
    process.env.EXTRACTION_WORKER_RECOVERY_INTERVAL_MS,
    defaultRecoveryIntervalMs
  );
}

function getHeartbeatIntervalMs() {
  return getPositiveInteger(
    process.env.EXTRACTION_WORKER_HEARTBEAT_INTERVAL_MS,
    defaultHeartbeatIntervalMs
  );
}

async function summarizeQueuedJobCounts(now: Date) {
  const [queuedTotal, dueCount, notDueCount, expiredCount, oldestQueuedJob, oldestDueJob] = await Promise.all([
    prisma.extractionJob.count({
      where: {
        status: "queued"
      }
    }),
    prisma.extractionJob.count({
      where: {
        status: "queued",
        availableAt: { lte: now },
        expiresAt: { gt: now }
      }
    }),
    prisma.extractionJob.count({
      where: {
        status: "queued",
        availableAt: { gt: now },
        expiresAt: { gt: now }
      }
    }),
    prisma.extractionJob.count({
      where: {
        status: "queued",
        expiresAt: { lte: now }
      }
    }),
    prisma.extractionJob.findFirst({
      where: {
        status: "queued"
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        sourceHost: true,
        sourceHash: true,
        status: true,
        sourceUrl: true,
        attemptCount: true,
        maxAttempts: true,
        availableAt: true,
        expiresAt: true
      }
    }),
    prisma.extractionJob.findFirst({
      where: {
        status: "queued",
        availableAt: { lte: now },
        expiresAt: { gt: now }
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        sourceHost: true,
        sourceHash: true,
        status: true,
        sourceUrl: true,
        attemptCount: true,
        maxAttempts: true,
        availableAt: true,
        expiresAt: true
      }
    })
  ]);

  return {
    queuedTotal,
    dueCount,
    notDueCount,
    expiredCount,
    oldestQueuedJob: oldestQueuedJob
      ? summarizeTrackedExtractionJob(oldestQueuedJob, now)
      : undefined,
    oldestDueJob: oldestDueJob
      ? summarizeTrackedExtractionJob(oldestDueJob, now)
      : undefined
  };
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
