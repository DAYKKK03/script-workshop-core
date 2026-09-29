import { getExtractionErrorBaseCode } from "@/lib/douyin/extraction-error-code";

const transientExtractionErrors = new Set([
  "ASR_QUERY_REQUEST_FAILED",
  "ASR_QUERY_TIMEOUT",
  "ASR_SUBMIT_FAILED",
  "TIKHUB_PROVIDER_TRANSIENT_FAILED"
]);

export function shouldRetryExtractionFailure({
  errorCode,
  attemptCount,
  maxAttempts
}: {
  errorCode: string;
  attemptCount: number;
  maxAttempts: number;
}) {
  return (
    attemptCount < maxAttempts &&
    transientExtractionErrors.has(getExtractionErrorBaseCode(errorCode) || errorCode)
  );
}

export function isExtractionLockStale({
  lockedAt,
  now = new Date(),
  lockTimeoutMs
}: {
  lockedAt: Date | null;
  now?: Date;
  lockTimeoutMs: number;
}) {
  return Boolean(
    lockedAt && now.getTime() - lockedAt.getTime() >= lockTimeoutMs
  );
}

export function getExtractionWorkerConcurrency(value?: string) {
  if (value === undefined) {
    return 2;
  }

  const parsed = Number.parseInt(value || "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 2);
}

export function getExtractionUserConcurrencyLimit(value?: string) {
  if (value === undefined) {
    return 2;
  }

  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2) : 2;
}

export function canAttemptExtractionJob({
  attemptCount,
  maxAttempts
}: {
  attemptCount: number;
  maxAttempts: number;
}) {
  return maxAttempts > 0 && attemptCount < maxAttempts;
}
