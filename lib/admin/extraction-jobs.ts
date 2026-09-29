import { createHash } from "crypto";
import { parseExtractionErrorCode } from "@/lib/douyin/extraction-error-code";
import { prisma } from "@/lib/prisma";

const defaultExtractionJobPageSize = 200;

export type AdminExtractionJobRow = {
  jobHash8: string;
  userHash8: string;
  projectHash8: string | null;
  sourceHost: string | null;
  sourceHash: string | null;
  status: "queued" | "processing" | "succeeded" | "failed";
  errorCode: string | null;
  failureReason: string | null;
  selectedMediaSummary: string | null;
  candidateSummary: string | null;
  attemptSummary: string;
  createdAt: Date;
  updatedAt: Date;
  availableAt: Date;
  lockedAt: Date | null;
  expiresAt: Date | null;
  transcriptState: "none" | "1-99" | "100-499" | "500+";
};

export async function getAdminExtractionJobs(
  limit = defaultExtractionJobPageSize
) {
  const rows = await prisma.extractionJob.findMany({
    select: {
      id: true,
      userId: true,
      projectId: true,
      sourceHost: true,
      sourceHash: true,
      status: true,
      errorCode: true,
      attemptCount: true,
      maxAttempts: true,
      createdAt: true,
      updatedAt: true,
      availableAt: true,
      lockedAt: true,
      expiresAt: true,
      transcript: true
    },
    orderBy: { createdAt: "desc" },
    take: clampExtractionJobLimit(limit)
  });

  return rows.map(serializeAdminExtractionJob);
}

export function serializeAdminExtractionJob(job: {
  id: string;
  userId: string;
  projectId: string | null;
  sourceHost: string | null;
  sourceHash: string | null;
  status: "queued" | "processing" | "succeeded" | "failed";
  errorCode: string | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  availableAt: Date;
  lockedAt: Date | null;
  expiresAt: Date | null;
  transcript: string | null;
}): AdminExtractionJobRow {
  const parsedError = parseExtractionErrorCode(job.errorCode);

  return {
    jobHash8: hash8(job.id),
    userHash8: hash8(job.userId),
    projectHash8: job.projectId ? hash8(job.projectId) : null,
    sourceHost: job.sourceHost,
    sourceHash: job.sourceHash,
    status: job.status,
    errorCode: parsedError.baseCode,
    failureReason: parsedError.safeDetail,
    selectedMediaSummary: formatSelectedMediaSummary(parsedError),
    candidateSummary: formatCandidateSummary(parsedError),
    attemptSummary: `${job.attemptCount}/${job.maxAttempts}`,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    availableAt: job.availableAt,
    lockedAt: job.lockedAt,
    expiresAt: job.expiresAt,
    transcriptState: summarizeTranscriptState(job.transcript)
  };
}

function formatSelectedMediaSummary(parsedError: ReturnType<typeof parseExtractionErrorCode>) {
  if (
    !parsedError.selectedMediaKind &&
    !parsedError.selectedMediaFormat &&
    !parsedError.selectedMediaPath
  ) {
    return null;
  }

  return [
    parsedError.selectedMediaKind || "-",
    parsedError.selectedMediaFormat || "-",
    parsedError.selectedMediaPath || "-"
  ].join(" / ");
}

function formatCandidateSummary(parsedError: ReturnType<typeof parseExtractionErrorCode>) {
  if (
    parsedError.candidateCount === null &&
    !parsedError.candidateKinds &&
    !parsedError.candidateFormats &&
    !parsedError.candidatePaths
  ) {
    return null;
  }

  const count = parsedError.candidateCount ?? 0;
  const parts = [
    `count=${count}`,
    parsedError.candidateKinds ? `kinds=${parsedError.candidateKinds}` : null,
    parsedError.candidateFormats
      ? `formats=${parsedError.candidateFormats}`
      : null,
    parsedError.candidatePaths ? `paths=${parsedError.candidatePaths}` : null
  ].filter(Boolean);

  return parts.join(" | ");
}

export function summarizeTranscriptState(transcript: string | null | undefined) {
  if (!transcript) {
    return "none" as const;
  }

  if (transcript.length < 100) {
    return "1-99" as const;
  }

  if (transcript.length < 500) {
    return "100-499" as const;
  }

  return "500+" as const;
}

function hash8(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function clampExtractionJobLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return defaultExtractionJobPageSize;
  }

  return Math.min(Math.trunc(limit), defaultExtractionJobPageSize);
}
