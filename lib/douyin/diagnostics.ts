import { createHash } from "crypto";

export type DiagnosticStringSummary = {
  length: number;
  hash8: string;
};

export type ExtractionFailureDiagnostic = {
  provider: "tikhub" | "asr" | "douyin";
  failureCategory:
    | "auth"
    | "request"
    | "transient"
    | "response_unsupported"
    | "provider_failure";
  failureReason?:
    | "submit_endpoint_invalid"
    | "submit_endpoint_not_found"
    | "submit_auth_rejected"
    | "submit_rate_limited"
    | "submit_provider_unavailable"
    | "submit_unsupported_media"
    | "submit_request_rejected"
    | "submit_timeout"
    | "submit_network"
    | "submit_invalid_response";
  attempts?: number;
  httpStatus?: number;
  retryable?: boolean;
  requestId?: string;
  normalizedUrlLength?: number;
  normalizedUrlHash8?: string;
  responseBodyLength?: number;
  responseBodyHash8?: string;
  selectedMediaKind?: "audio" | "video";
  selectedMediaFormat?: "mp3" | "wav" | "m4a" | "aac" | "ogg" | "mp4";
  selectedMediaPath?: string;
  candidateCount?: number;
  candidateKinds?: string;
  candidateFormats?: string;
  candidatePaths?: string;
  relayUsed?: boolean;
  relayFailureReason?: string;
  relayDownloadStatusClass?: string;
  relayContentType?: string;
  relaySizeBucket?: string;
  relayDurationBucket?: string;
  relayObjectKeyHash8?: string;
  relayCleanupResult?: "success" | "failed" | "not_needed";
  relayRemoteDeleteAttempted?: boolean;
  relayRemoteDeleteResult?:
    | "deleted"
    | "delete_failed"
    | "deferred_to_lifecycle";
};

export type ExtractionFailureLogPayload = {
  event: "douyin_extraction_failed";
  jobId: string;
  provider: ExtractionFailureDiagnostic["provider"];
  errorCode: string;
  sourceHost?: string | null;
  sourceHash?: string | null;
  diagnostic: Omit<ExtractionFailureDiagnostic, "provider">;
};

export type ExtractionClaimFailureCategory =
  | "no_candidate"
  | "not_due"
  | "expired"
  | "max_attempts"
  | "contention_lost"
  | "db_error"
  | "unknown";

export type ExtractionClaimCounts = {
  dueCount: number;
  expiredCount: number;
  notDueCount: number;
  queuedTotal: number;
};

export type ExtractionClaimDiagnostic = {
  event: "douyin_extraction_claim";
  workerId: string;
  result: "claimed" | "skipped" | "contention_lost" | "db_error";
  failureCategory?: ExtractionClaimFailureCategory;
  claimAttempt: number;
  candidateCount: number;
  dueCount: number;
  exhaustedCount: number;
  expiredCount?: number;
  notDueCount?: number;
  queuedTotal?: number;
  jobId?: string;
  sourceHost?: string | null;
  sourceHash?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  availableAtDue?: boolean;
  expiresAtValid?: boolean;
  errorName?: string;
};

export type ExtractionWorkerTickDiagnostic = {
  event: "douyin_extraction_worker_tick";
  workerId: string;
  concurrency: number;
  activeCount: number;
  queuedTotal?: number;
  dueCount?: number;
  expiredCount?: number;
  notDueCount?: number;
  oldestQueuedJob?: TrackedExtractionJobSummary;
  oldestDueJob?: TrackedExtractionJobSummary;
};

export type ExtractionJobLifecycleDiagnostic = {
  event: "douyin_extraction_job_created" | "douyin_extraction_job_observed";
  jobId: string;
  userHash8: string;
  sourceHost?: string | null;
  sourceHash?: string | null;
  status: "queued" | "processing" | "succeeded" | "failed";
  sourceUrlPresent: boolean;
  attemptCount: number;
  maxAttempts: number;
  availableAtDue: boolean;
  expiresAtValid: boolean;
  activeJobCount?: number;
  ageMs?: number;
};

export type TrackedExtractionJobSummary = {
  jobId: string;
  sourceHost?: string | null;
  sourceHash?: string | null;
  status: "queued" | "processing" | "succeeded" | "failed";
  attemptCount: number;
  maxAttempts: number;
  availableAtDue: boolean;
  expiresAtValid: boolean;
  sourceUrlPresent: boolean;
};

export function summarizeDiagnosticString(
  value: string | null | undefined
): DiagnosticStringSummary | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return {
    length: value.length,
    hash8: createHash("sha256").update(value).digest("hex").slice(0, 8)
  };
}

export function summarizeDiagnosticPayload(
  value: unknown
): DiagnosticStringSummary | undefined {
  try {
    const serialized = JSON.stringify(value);
    return summarizeDiagnosticString(serialized);
  } catch {
    return undefined;
  }
}

export function summarizeNormalizedUrl(url: string): DiagnosticStringSummary {
  return {
    length: url.length,
    hash8: createHash("sha256").update(url).digest("hex").slice(0, 8)
  };
}

export function classifyExtractionClaimFailure({
  candidateCount,
  counts,
  exhaustedCount
}: {
  candidateCount: number;
  counts: ExtractionClaimCounts;
  exhaustedCount: number;
}): ExtractionClaimFailureCategory {
  if (candidateCount === 0 && counts.queuedTotal === 0) {
    return "no_candidate";
  }

  if (counts.dueCount === 0 && counts.notDueCount > 0) {
    return "not_due";
  }

  if (counts.dueCount === 0 && counts.expiredCount > 0) {
    return "expired";
  }

  if (candidateCount > 0 && exhaustedCount === candidateCount) {
    return "max_attempts";
  }

  if (candidateCount === 0) {
    return "unknown";
  }

  return "contention_lost";
}

export function summarizeTrackedExtractionJob(
  job: {
    id: string;
    sourceHost?: string | null;
    sourceHash?: string | null;
    status: "queued" | "processing" | "succeeded" | "failed";
    sourceUrl?: string | null;
    attemptCount: number;
    maxAttempts: number;
    availableAt: Date;
    expiresAt: Date | null;
  },
  now = new Date()
): TrackedExtractionJobSummary {
  return {
    jobId: job.id,
    sourceHost: job.sourceHost,
    sourceHash: job.sourceHash,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    availableAtDue: job.availableAt <= now,
    expiresAtValid: Boolean(job.expiresAt && job.expiresAt > now),
    sourceUrlPresent: Boolean(job.sourceUrl)
  };
}

export function summarizeExtractionJobObservation({
  event,
  userId,
  job,
  activeJobCount,
  now = new Date()
}: {
  event: ExtractionJobLifecycleDiagnostic["event"];
  userId: string;
  job: {
    id: string;
    sourceHost?: string | null;
    sourceHash?: string | null;
    status: "queued" | "processing" | "succeeded" | "failed";
    sourceUrl?: string | null;
    attemptCount: number;
    maxAttempts: number;
    availableAt: Date;
    expiresAt: Date | null;
    createdAt?: Date;
  };
  activeJobCount?: number;
  now?: Date;
}): ExtractionJobLifecycleDiagnostic {
  const tracked = summarizeTrackedExtractionJob(job, now);

  return {
    event,
    jobId: tracked.jobId,
    userHash8: summarizeDiagnosticString(userId)?.hash8 || "unknown",
    sourceHost: tracked.sourceHost,
    sourceHash: tracked.sourceHash,
    status: tracked.status,
    sourceUrlPresent: tracked.sourceUrlPresent,
    attemptCount: tracked.attemptCount,
    maxAttempts: tracked.maxAttempts,
    availableAtDue: tracked.availableAtDue,
    expiresAtValid: tracked.expiresAtValid,
    activeJobCount,
    ageMs: job.createdAt ? Math.max(0, now.getTime() - job.createdAt.getTime()) : undefined
  };
}

export function logExtractionFailureDiagnostic(
  payload: ExtractionFailureLogPayload
) {
  console.error(JSON.stringify(payload));
}

export function logExtractionClaimDiagnostic(
  payload: ExtractionClaimDiagnostic
) {
  console.info(JSON.stringify(payload));
}

export function logExtractionWorkerTick(
  payload: ExtractionWorkerTickDiagnostic
) {
  console.info(JSON.stringify(payload));
}

export function logExtractionJobLifecycleDiagnostic(
  payload: ExtractionJobLifecycleDiagnostic
) {
  console.info(JSON.stringify(payload));
}
