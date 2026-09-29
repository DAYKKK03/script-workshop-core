import { createHash } from "node:crypto";
import type {
  DeepSeekFailureDiagnostic,
  DeepSeekFailureSubreason
} from "@/lib/ai/deepseek";

export type AnalyzeReferenceFailureSubreason =
  | DeepSeekFailureSubreason
  | "transcript_empty"
  | "transcript_too_short"
  | "schema_invalid";

type AnalyzeReferenceFailureInput = {
  errorCode: string;
  providerSubreason?: AnalyzeReferenceFailureSubreason;
  transcript?: string | null;
  sectionsCount?: number;
  userId?: string;
  diagnostic?: DeepSeekFailureDiagnostic;
};

const safeErrorCodes = new Set([
  "ORIGINAL_TRANSCRIPT_REQUIRED",
  "REFERENCE_TRANSCRIPT_TOO_SHORT",
  "AI_PROVIDER_NOT_CONFIGURED",
  "AI_PROVIDER_FAILED",
  "AI_PROVIDER_INVALID_RESPONSE",
  "INVALID_REFERENCE_STRUCTURE",
  "ANALYZE_FAILED"
]);

const safeSubreasons = new Set<AnalyzeReferenceFailureSubreason>([
  "http_3xx",
  "http_4xx",
  "http_5xx",
  "timeout",
  "network_error",
  "empty_content",
  "provider_envelope_invalid_json",
  "model_content_invalid_json",
  "not_configured",
  "transcript_empty",
  "transcript_too_short",
  "schema_invalid",
  "unknown"
]);

export function logAnalyzeReferenceFailure(
  input: AnalyzeReferenceFailureInput
) {
  const diagnostic = input.diagnostic;
  const providerSubreason =
    input.providerSubreason || diagnostic?.providerSubreason;
  const payload: Record<string, unknown> = {
    event: "analyze_reference_failed",
    errorCode: safeErrorCodes.has(input.errorCode)
      ? input.errorCode
      : "ANALYZE_FAILED",
    transcriptLengthBucket: getTranscriptLengthBucket(input.transcript),
    userHash8: hash8(input.userId)
  };

  if (providerSubreason && safeSubreasons.has(providerSubreason)) {
    payload.providerSubreason = providerSubreason;
  }

  if (
    typeof input.sectionsCount === "number" &&
    Number.isInteger(input.sectionsCount)
  ) {
    payload.sectionsCount = Math.max(0, Math.min(input.sectionsCount, 100));
  }

  if (diagnostic) {
    payload.attempts = diagnostic.attempts;
    payload.httpStatusClass = diagnostic.httpStatusClass;
    payload.model = sanitizeModel(diagnostic.model);
    payload.baseHostPath = diagnostic.baseHostPath;
  }

  console.error(JSON.stringify(payload));
}

export function getTranscriptLengthBucket(value: string | null | undefined) {
  const length =
    typeof value === "string" ? value.replace(/\s+/g, "").length : 0;

  if (length === 0) return "0";
  if (length < 40) return "1-39";
  if (length < 100) return "40-99";
  if (length < 500) return "100-499";
  if (length < 2000) return "500-1999";
  return "2000+";
}

function hash8(value: string | undefined) {
  return value
    ? createHash("sha256").update(value).digest("hex").slice(0, 8)
    : "unknown";
}

function sanitizeModel(value: string | undefined) {
  return value?.replace(/[\r\n\t]/g, " ").trim().slice(0, 80) || undefined;
}
