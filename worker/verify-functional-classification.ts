export const extractionWorkerVerificationFailureCodes = [
  "probe_setup_failed", "probe_timed_out", "terminal_status_mismatch", "terminal_error_code_mismatch",
  "attempt_count_mismatch", "lease_not_released", "probe_cleanup_failed", "database_error"
] as const;
export type ExtractionWorkerVerificationFailureCode = (typeof extractionWorkerVerificationFailureCodes)[number];
export function classifyExtractionWorkerVerificationFailure(value: unknown): ExtractionWorkerVerificationFailureCode {
  return typeof value === "string" && extractionWorkerVerificationFailureCodes.includes(value as ExtractionWorkerVerificationFailureCode) ? value as ExtractionWorkerVerificationFailureCode : "database_error";
}
