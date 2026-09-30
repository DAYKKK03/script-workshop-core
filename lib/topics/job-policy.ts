const defaultTopicJobTtlMs = 30 * 60 * 1000;
const defaultTopicJobLockTimeoutMs = 6 * 60 * 1000;
const defaultTopicJobRunTimeoutMs = 5 * 60 * 1000;
const topicJobRetryMinimumRemainingMs = 30 * 1000;

const recoverableTopicProviderFailureCodes = new Set([
  "AI_PROVIDER_EMPTY_RESPONSE",
  "AI_PROVIDER_INVALID_JSON",
  "AI_PROVIDER_INVALID_RESPONSE",
  "AI_PROVIDER_NETWORK_ERROR",
  "AI_PROVIDER_TIMEOUT"
]);

export function getTopicJobTtlMs() {
  return positiveInteger(process.env.TOPIC_JOB_TTL_MS, defaultTopicJobTtlMs);
}

export function getTopicJobLockTimeoutMs() {
  return positiveInteger(
    process.env.TOPIC_JOB_LOCK_TIMEOUT_MS,
    defaultTopicJobLockTimeoutMs
  );
}

export function getTopicJobRunTimeoutMs() {
  return positiveInteger(process.env.TOPIC_JOB_RUN_TIMEOUT_MS, defaultTopicJobRunTimeoutMs);
}

export function getTopicJobHeartbeatIntervalMs() {
  return Math.max(1_000, Math.min(30_000, Math.floor(getTopicJobLockTimeoutMs() / 3)));
}

export function canAttemptTopicJob(job: {
  attemptCount: number;
  maxAttempts: number;
}) {
  return job.attemptCount < job.maxAttempts;
}

/** Retry only known transient Provider/format failures within the original job deadline. */
export function isRecoverableTopicProviderFailure(errorCode: string) {
  return recoverableTopicProviderFailureCodes.has(errorCode);
}

export function getTopicJobRetryMinimumRemainingMs() {
  return topicJobRetryMinimumRemainingMs;
}

export function canRequeueRecoverableTopicFailure(input: {
  errorCode: string;
  attemptCount: number;
  maxAttempts: number;
  runDeadlineAt: Date;
  now: Date;
}) {
  return isRecoverableTopicProviderFailure(input.errorCode)
    && input.attemptCount === 1
    && input.maxAttempts >= 2
    && canAttemptTopicJob(input)
    && input.runDeadlineAt.getTime() - input.now.getTime() > topicJobRetryMinimumRemainingMs;
}

/** Coarse observability bucket; never expose an exact remaining deadline. */
export function topicRemainingBudgetBucket(runDeadlineAtMs: number, nowMs = Date.now()) {
  const remaining = Math.max(0, runDeadlineAtMs - nowMs);
  if (remaining < 30_000) return "under_30s";
  if (remaining < 60_000) return "30_60s";
  if (remaining < 120_000) return "1_2m";
  if (remaining < 300_000) return "2_5m";
  return "over_5m";
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
