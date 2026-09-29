import {
  type DeepSeekFailureDiagnostic,
  type DeepSeekJsonResult
} from "@/lib/ai/deepseek-runtime";
import type {
  ReplacementProbeValidationReason,
  ChoiceReasonCounts,
  ChoiceReasonCountKey
} from "@/lib/custom-scripts/staging-replacement-probe-contract";

export const baseSentenceLengthBucketKeys = ["le_10", "11_15", "16_20", "21_24", "25"] as const;
export const replacementCountBucketValues = ["0", "1_5", "6_12", "13_23", "24"] as const;
export type ReplacementCountBucket = (typeof replacementCountBucketValues)[number];
export type BaseSentenceLengthBuckets = Record<
  (typeof baseSentenceLengthBucketKeys)[number],
  ReplacementCountBucket
>;
export type ReasonCountBuckets = Record<ChoiceReasonCountKey, ReplacementCountBucket>;
export type ReplacementCandidateCountBucket = "0" | "1_24" | "25_48" | "49_72";
export type ReplacementLengthBucket =
  | "not_assembled"
  | "under_200"
  | "200_239"
  | "240_259"
  | "260_279"
  | "valid_280_300"
  | "301_320"
  | "321_360"
  | "over_360";
export type ReplacementChoiceCountBucket = "exact_24" | "not_24";
export type SafeFinishReason = "stop" | "length" | "content_filter" | "tool_calls" | "unknown";
export type SafeResponseLengthBucket = "0" | "1-999" | "1000-2999" | "3000-7999" | "8000+" | "unknown";
export type SafeParseError = "empty_content" | "truncated_json" | "json_syntax" | "html_body" | "none";
export type SafeTokenBucket = "missing_or_zero" | "1-999" | "1000-4999" | "5000-9999" | "10000+" | "unknown";
const safeFinishReasons = ["stop", "length", "content_filter", "tool_calls"] as const;
const safeResponseLengthBuckets = ["0", "1-999", "1000-2999", "3000-7999", "8000+"] as const;
const safeParseErrors = ["empty_content", "truncated_json", "json_syntax", "html_body"] as const;
const safeTokenBuckets = ["missing_or_zero", "1-999", "1000-4999", "5000-9999", "10000+"] as const;

export type SafeProviderDiagnostic = {
  finishReason: SafeFinishReason;
  responseLengthBucket: SafeResponseLengthBucket;
  parseError: SafeParseError;
  promptTokensBucket: SafeTokenBucket;
  completionTokensBucket: SafeTokenBucket;
  promptCacheHitTokensBucket: SafeTokenBucket;
  promptCacheMissTokensBucket: SafeTokenBucket;
};

export type ReplacementProbeMetric = {
  runIndex: number;
  status: "passed" | "failed" | "provider_failed";
  durationMs: number;
  providerCalls: 1 | 2;
  baseJsonParsed: boolean;
  baseExact24: boolean;
  baseLengthBucket: ReplacementLengthBucket;
  baseSentenceLengthBuckets: BaseSentenceLengthBuckets;
  choiceJsonParsed: boolean;
  choiceCountBucket: ReplacementChoiceCountBucket;
  validChoiceCountBucket: ReplacementCountBucket;
  validCandidateCountBucket: ReplacementCandidateCountBucket;
  reasonCountBuckets: ReasonCountBuckets;
  selectedCountBucket: ReplacementCountBucket;
  finalLengthBucket: ReplacementLengthBucket;
  validationReason: ReplacementProbeValidationReason;
  firstCall: SafeProviderDiagnostic;
  secondCall: SafeProviderDiagnostic | null;
};

type AnyProviderDiagnostic = DeepSeekJsonResult["diagnostic"];

export function buildReplacementProbeFailureMetric(input: {
  runIndex: number;
  durationMs: number;
  providerCalls: 1 | 2;
  validationReason: ReplacementProbeValidationReason;
  firstResponse: DeepSeekJsonResult;
  secondResponse?: DeepSeekJsonResult;
  baseJsonParsed?: boolean;
  baseExact24?: boolean;
  baseLength?: number;
  baseSentenceLengthBuckets?: BaseSentenceLengthBuckets;
}): ReplacementProbeMetric {
  return {
    runIndex: input.runIndex,
    status: input.validationReason === "provider_failed" || input.validationReason === "empty_content"
      ? "provider_failed"
      : "failed",
    durationMs: input.durationMs,
    providerCalls: input.providerCalls,
    baseJsonParsed: input.baseJsonParsed ?? false,
    baseExact24: input.baseExact24 ?? false,
    baseLengthBucket: input.baseLength === undefined ? "not_assembled" : replacementLengthBucket(input.baseLength),
    baseSentenceLengthBuckets: input.baseSentenceLengthBuckets ?? emptyBaseSentenceLengthBuckets(),
    choiceJsonParsed: false,
    choiceCountBucket: "not_24",
    validChoiceCountBucket: "0",
    validCandidateCountBucket: "0",
    reasonCountBuckets: emptyReasonCountBuckets(),
    selectedCountBucket: "0",
    finalLengthBucket: "not_assembled",
    validationReason: input.validationReason,
    firstCall: safeProviderDiagnostic(input.firstResponse.diagnostic),
    secondCall: input.secondResponse ? safeProviderDiagnostic(input.secondResponse.diagnostic) : null
  };
}

function emptyReasonCountBuckets(): ReasonCountBuckets {
  return {
    choice_value: "0",
    prefix_ids_count: "0",
    prefix_id_unknown: "0",
    prefix_id_duplicate: "0",
    sentence_length: "0",
    forbidden_expression: "0",
    fact_safety: "0",
    cta: "0",
    other: "0"
  };
}

export function bucketChoiceReasonCounts(counts: ChoiceReasonCounts): ReasonCountBuckets {
  return Object.fromEntries(
    Object.entries(counts).map(([reason, count]) => [reason, replacementItemCountBucket(count)])
  ) as ReasonCountBuckets;
}

export function countBaseSentenceLengthBuckets(sentences: string[]): BaseSentenceLengthBuckets {
  const counts = { le_10: 0, "11_15": 0, "16_20": 0, "21_24": 0, "25": 0 };
  for (const sentence of sentences) {
    const length = Array.from(sentence.replace(/[。！？!?]$/u, "").replace(/\p{White_Space}/gu, "")).length;
    if (length <= 10) counts.le_10 += 1;
    else if (length <= 15) counts["11_15"] += 1;
    else if (length <= 20) counts["16_20"] += 1;
    else if (length <= 24) counts["21_24"] += 1;
    else counts["25"] += 1;
  }
  return Object.fromEntries(
    Object.entries(counts).map(([bucket, count]) => [bucket, replacementItemCountBucket(count)])
  ) as BaseSentenceLengthBuckets;
}

function emptyBaseSentenceLengthBuckets(): BaseSentenceLengthBuckets {
  return { le_10: "0", "11_15": "0", "16_20": "0", "21_24": "0", "25": "0" };
}

export function replacementProbeProviderReason(
  diagnostic: DeepSeekFailureDiagnostic
): ReplacementProbeValidationReason {
  if (diagnostic.providerSubreason === "empty_content") return "empty_content";
  if (
    diagnostic.providerSubreason === "model_content_invalid_json" ||
    diagnostic.providerSubreason === "provider_envelope_invalid_json"
  ) return "json_syntax";
  return "provider_failed";
}

export function safeProviderDiagnostic(diagnostic: AnyProviderDiagnostic): SafeProviderDiagnostic {
  const value = diagnostic as DeepSeekFailureDiagnostic;
  return {
    finishReason: allowlistedFinishReason(diagnostic.finishReason),
    responseLengthBucket: allowlistedResponseLengthBucket(value.responseLengthBucket),
    parseError: allowlistedParseError(value.parseError),
    promptTokensBucket: allowlistedTokenBucket(diagnostic.promptTokensBucket),
    completionTokensBucket: allowlistedTokenBucket(diagnostic.completionTokensBucket),
    promptCacheHitTokensBucket: allowlistedTokenBucket(diagnostic.promptCacheHitTokensBucket),
    promptCacheMissTokensBucket: allowlistedTokenBucket(diagnostic.promptCacheMissTokensBucket)
  };
}

export function replacementItemCountBucket(value: number): ReplacementCountBucket {
  if (value <= 0) return "0";
  if (value <= 5) return "1_5";
  if (value <= 12) return "6_12";
  if (value <= 23) return "13_23";
  return "24";
}

export function replacementCandidateCountBucket(value: number): ReplacementCandidateCountBucket {
  if (value <= 0) return "0";
  if (value <= 24) return "1_24";
  if (value <= 48) return "25_48";
  return "49_72";
}

export function replacementLengthBucket(length: number): Exclude<ReplacementLengthBucket, "not_assembled"> {
  if (length < 200) return "under_200";
  if (length < 240) return "200_239";
  if (length < 260) return "240_259";
  if (length < 280) return "260_279";
  if (length <= 300) return "valid_280_300";
  if (length <= 320) return "301_320";
  if (length <= 360) return "321_360";
  return "over_360";
}

function allowlistedFinishReason(value: unknown): SafeFinishReason {
  return isAllowedString(value, safeFinishReasons)
    ? value
    : "unknown";
}

function allowlistedResponseLengthBucket(value: unknown): SafeResponseLengthBucket {
  return isAllowedString(value, safeResponseLengthBuckets)
    ? value
    : "unknown";
}

function allowlistedParseError(value: unknown): SafeParseError {
  return isAllowedString(value, safeParseErrors)
    ? value
    : "none";
}

function allowlistedTokenBucket(value: unknown): SafeTokenBucket {
  return isAllowedString(value, safeTokenBuckets)
    ? value
    : "unknown";
}

function isAllowedString<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values
): value is Values[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
