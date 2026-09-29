export const CUSTOM_SCRIPT_JOB_RUN_TIMEOUT_MS = 120_000;
export const CUSTOM_SCRIPT_JOB_TERMINAL_TTL_MS = 30 * 60_000;
export const CUSTOM_SCRIPT_JOB_LEASE_MS = 30_000;
export const CUSTOM_SCRIPT_JOB_HEARTBEAT_MS = 10_000;
export const CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT = 2;
export const CUSTOM_SCRIPT_HOURLY_LIMIT = 10;
export const CUSTOM_SCRIPT_QUALITY_LEASE_RECOVERY_MS = CUSTOM_SCRIPT_JOB_LEASE_MS;
export const CUSTOM_SCRIPT_QUALITY_COMPLETION_GUARD_MS = 5_000;
export const CUSTOM_SCRIPT_QUALITY_RECOVERY_MARGIN_MS = 5_000;
export const CUSTOM_SCRIPT_QUALITY_REQUIRED_REMAINING_MS =
  CUSTOM_SCRIPT_QUALITY_LEASE_RECOVERY_MS
  + CUSTOM_SCRIPT_QUALITY_RECOVERY_MARGIN_MS
  + CUSTOM_SCRIPT_QUALITY_COMPLETION_GUARD_MS;

export function customScriptRunDeadline(createdAt: Date) {
  return new Date(createdAt.getTime() + CUSTOM_SCRIPT_JOB_RUN_TIMEOUT_MS);
}

export function customScriptTerminalExpiry(finishedAt: Date) {
  return new Date(finishedAt.getTime() + CUSTOM_SCRIPT_JOB_TERMINAL_TTL_MS);
}

export function customScriptLeaseStaleBefore(now: Date) {
  return new Date(now.getTime() - CUSTOM_SCRIPT_JOB_LEASE_MS);
}

/** Leaves a full stale-lease recovery window plus time for the success transaction. */
export function customScriptQualityProviderTimeoutMs(remainingMs: number) {
  return Math.max(0, remainingMs - CUSTOM_SCRIPT_QUALITY_REQUIRED_REMAINING_MS);
}
