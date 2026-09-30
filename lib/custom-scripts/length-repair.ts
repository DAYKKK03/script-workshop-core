export const CUSTOM_SCRIPT_LENGTH_BUCKETS = [
  "under_80",
  "351_360",
  "over_360"
] as const;

export const CUSTOM_SCRIPT_MIN_CODE_POINTS = 80;
export const CUSTOM_SCRIPT_MAX_CODE_POINTS = 350;
export const CUSTOM_SCRIPT_PRODUCT_TARGET_MIN_CODE_POINTS = 200;
export const CUSTOM_SCRIPT_TARGET_MIN_CODE_POINTS = 240;
export const CUSTOM_SCRIPT_TARGET_MAX_CODE_POINTS = 300;

export type CustomScriptLengthBucket = (typeof CUSTOM_SCRIPT_LENGTH_BUCKETS)[number];
export type CustomScriptLengthDirection = "short" | "long";
export const CUSTOM_SCRIPT_LINE_COUNT_BUCKETS = [
  "under_5",
  "5_9",
  "10_14",
  "15_20",
  "21_30",
  "over_30"
] as const;
export type CustomScriptLineCountBucket = (typeof CUSTOM_SCRIPT_LINE_COUNT_BUCKETS)[number];
export type CustomScriptLengthRepairContext = {
  actualCount: number;
  direction: CustomScriptLengthDirection;
  lengthBucket: CustomScriptLengthBucket;
};

export type CustomScriptValidationReason =
  | "client_request_id"
  | "project_id"
  | "request_length"
  | "objective"
  | "tone"
  | "previous_script"
  | "source_project_id"
  | "source_type"
  | "source_objective"
  | "source_body_without_header"
  | "source_body_mismatch"
  | "source_header_position"
  | "source_project_name"
  | "source_content_empty"
  | "source_reserved_duplicate"
  | "shape"
  | "missing_facts_shape"
  | "missing_facts_value"
  | "length"
  | "empty_script"
  | "sentence_format"
  | "sentence_length"
  | "list_or_heading"
  | "non_speech_content"
  | "forbidden_expression"
  | "fact_safety"
  | "cta"
  | "duplicate_previous"
  | "duplicate_opening"
  | "duplicate_body";

export type NonLengthValidationReason = Exclude<CustomScriptValidationReason, "length">;

export type CustomScriptValidationRepair =
  | {
      reason: "length";
      repairContext: CustomScriptLengthRepairContext;
      repairMode: "fresh";
    }
  | { reason: NonLengthValidationReason | "empty_content" | "json_syntax"; repairContext?: never };

export type CustomScriptRepair =
  | CustomScriptValidationRepair
  | { reason: "quality_enrichment"; repairMode: "fresh" };

/** A safe short script may get one best-effort quality pass, but is already usable. */
export function shouldAttemptCustomScriptQualityEnrichment(actualCount: number) {
  return actualCount >= CUSTOM_SCRIPT_MIN_CODE_POINTS
    && actualCount < CUSTOM_SCRIPT_PRODUCT_TARGET_MIN_CODE_POINTS;
}

/** Prefer the product range; within the same range, keep the longer safe script. */
export function shouldUseCustomScriptQualityCandidate(firstCount: number, candidateCount: number) {
  const firstMeetsProductTarget = firstCount >= CUSTOM_SCRIPT_PRODUCT_TARGET_MIN_CODE_POINTS;
  const candidateMeetsProductTarget = candidateCount >= CUSTOM_SCRIPT_PRODUCT_TARGET_MIN_CODE_POINTS;
  if (firstMeetsProductTarget !== candidateMeetsProductTarget) return candidateMeetsProductTarget;
  return candidateCount > firstCount;
}

/** Keeps the exact count in memory while exposing only an allowlisted bucket to logs. */
export function createCustomScriptLengthRepairContext(actualCount: number): CustomScriptLengthRepairContext {
  if (actualCount < CUSTOM_SCRIPT_MIN_CODE_POINTS) {
    return {
      actualCount,
      direction: "short",
      lengthBucket: "under_80"
    };
  }
  return {
    actualCount,
    direction: "long",
    lengthBucket: actualCount <= 360 ? "351_360" : "over_360"
  };
}

/** Converts a derived line count to a non-exact allowlisted logging bucket. */
export function createCustomScriptLineCountBucket(lineCount: number): CustomScriptLineCountBucket {
  if (lineCount < 5) return "under_5";
  if (lineCount < 10) return "5_9";
  if (lineCount < 15) return "10_14";
  if (lineCount < 21) return "15_20";
  if (lineCount < 31) return "21_30";
  return "over_30";
}
