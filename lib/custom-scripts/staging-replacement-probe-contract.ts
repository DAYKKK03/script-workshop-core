import {
  CustomScriptValidationError,
  validateCustomScriptDomainOutput,
  type CustomScriptObjective
} from "@/lib/custom-scripts/contracts";
import {
  compareStagingReplacementPrefixIds,
  getStagingReplacementPrefix,
  isStagingReplacementPrefixId,
  type StagingReplacementPrefixId
} from "@/lib/custom-scripts/staging-replacement-prefixes";
import { assembleStagingProbeSentences } from "@/lib/custom-scripts/staging-sentence-probe-contract";
import { countCustomScriptCodePoints } from "@/lib/custom-scripts/text";
import {
  isReplacementSelectionBudgetExceeded,
  selectDeterministicReplacementSubset,
  type ReplacementSelectionBudget
} from "@/lib/custom-scripts/staging-replacement-probe-selection";

export { selectDeterministicReplacementSubset } from "@/lib/custom-scripts/staging-replacement-probe-selection";
export type { ReplacementSelection } from "@/lib/custom-scripts/staging-replacement-probe-selection";

const replacementCount = 24;
export const choiceReasonKeys = [
  "choice_value", "prefix_ids_count", "prefix_id_unknown", "prefix_id_duplicate",
  "sentence_length", "forbidden_expression", "fact_safety", "cta", "other"
] as const;
export type ChoiceReasonCountKey = (typeof choiceReasonKeys)[number];
export type ChoiceReasonCounts = Record<ChoiceReasonCountKey, number>;

const validationReasons = [
  "none", "gate_disabled", "staging_provider_disabled", "model_mismatch", "profile_not_found",
  "provider_failed", "empty_content", "json_syntax", "shape", "needs_profile", "sentence_count",
  "sentence_value", "sentence_format", "sentence_length", "list_or_heading", "non_speech_content",
  "missing_facts_shape", "missing_facts_value", "length", "forbidden_expression", "fact_safety", "cta",
  "duplicate_previous", "duplicate_opening", "duplicate_body", "choice_count", "choice_index",
  "choice_value", "prefix_ids_count", "prefix_id_unknown", "prefix_id_duplicate",
  "no_solution", "selection_budget", "final_validation", "base_over_length"
] as const;

export type ReplacementProbeValidationReason = (typeof validationReasons)[number];
export type ReplacementCandidate = { index: number; prefixId: StagingReplacementPrefixId };

export type PrefixChoiceEvaluation = {
  jsonParsed: boolean;
  exact24: boolean;
  validCandidates: ReplacementCandidate[];
  validChoiceCount: number;
  reasonCounts: ChoiceReasonCounts;
  validationReason: ReplacementProbeValidationReason;
};

export class ReplacementProbeValidationError extends Error {
  constructor(public readonly reason: ReplacementProbeValidationReason) {
    super("STAGING_REPLACEMENT_PROBE_REJECTED");
  }
}

export function parseStagingReplacementBase(
  content: string,
  context: ReplacementValidationContext
) {
  const parsed = parseJsonObject(content);
  if (parsed.status === "needs_profile") {
    validateDomain(parsed, context);
    throw new ReplacementProbeValidationError("needs_profile");
  }
  if (parsed.status !== "success" || !hasExactKeys(parsed, ["status", "sentences"])) {
    throw new ReplacementProbeValidationError("shape");
  }

  let finalScript: string;
  try {
    finalScript = assembleStagingProbeSentences(parsed.sentences);
  } catch (error) {
    throw new ReplacementProbeValidationError(reasonFrom(error));
  }
  validateNonLengthDomain(finalScript, context);
  return {
    sentences: parsed.sentences as string[],
    finalScript,
    length: countCustomScriptCodePoints(finalScript)
  };
}

/** Parses exact indexed ID choices; model text never becomes a replacement candidate. */
export function evaluateStagingPrefixChoices(
  content: string,
  originalSentences: string[],
  context: ReplacementValidationContext
): PrefixChoiceEvaluation {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(content);
  } catch (error) {
    return failedChoiceEvaluation(reasonFrom(error));
  }
  if (parsed.status !== "success" || !hasExactKeys(parsed, ["status", "prefixChoices"])) {
    return failedChoiceEvaluation("shape", true);
  }
  if (!Array.isArray(parsed.prefixChoices) || parsed.prefixChoices.length !== replacementCount) {
    return failedChoiceEvaluation("choice_count", true);
  }
  const indexes = parsed.prefixChoices.map((item) => isRecord(item) ? item.index : undefined);
  if (
    indexes.some((index) => !Number.isInteger(index) || Number(index) < 0 || Number(index) >= replacementCount) ||
    new Set(indexes).size !== replacementCount
  ) {
    return failedChoiceEvaluation("choice_index", true);
  }

  const validCandidates: ReplacementCandidate[] = [];
  const reasonCounts = emptyReasonCounts();
  let validChoiceCount = 0;
  let firstInvalidReason: ReplacementProbeValidationReason | undefined;
  for (const item of parsed.prefixChoices) {
    try {
      const choice = validateChoiceItem(item);
      validChoiceCount += 1;
      const original = originalSentences[choice.index];
      if (typeof original !== "string") throw new ReplacementProbeValidationError("choice_index");
      for (const prefixId of choice.prefixIds) {
        try {
          const fixedPrefix = getStagingReplacementPrefix(prefixId);
          validateNonLengthDomain(`${fixedPrefix}${original}`, context);
          validCandidates.push({ index: choice.index, prefixId });
        } catch (error) {
          const reason = reasonFrom(error);
          firstInvalidReason ??= reason;
          reasonCounts[choiceReasonKey(reason)] += 1;
        }
      }
    } catch (error) {
      const reason = reasonFrom(error);
      firstInvalidReason ??= reason;
      reasonCounts[choiceReasonKey(reason)] += 1;
    }
  }

  return {
    jsonParsed: true,
    exact24: validChoiceCount === replacementCount,
    validCandidates: validCandidates.sort((left, right) =>
      left.index - right.index || compareStagingReplacementPrefixIds(left.prefixId, right.prefixId)
    ),
    validChoiceCount,
    reasonCounts,
    validationReason: firstInvalidReason ?? "none"
  };
}

/** Rebuilds every selected sentence from the fixed ID map and reuses the complete validator. */
export function finalizeStagingReplacementScript(input: {
  originalSentences: string[];
  candidates: ReplacementCandidate[];
  context: ReplacementValidationContext;
  selectionBudget?: Partial<ReplacementSelectionBudget>;
}) {
  const baseScript = assembleStagingProbeSentences(input.originalSentences);
  const baseLength = countCustomScriptCodePoints(baseScript);
  const canonicalCandidates = canonicalizeFinalizerCandidates(input.candidates, input.originalSentences, input.context);
  const selection = selectDeterministicReplacementSubset(
    baseLength,
    canonicalCandidates.map(({ index, prefixId }) => ({
      index,
      prefixId,
      delta: countCustomScriptCodePoints(getStagingReplacementPrefix(prefixId))
    })),
    input.selectionBudget
  );
  if (isReplacementSelectionBudgetExceeded(selection)) {
    throw new ReplacementProbeValidationError("selection_budget");
  }
  if (!selection || selection.selectedChoices.length === 0) {
    throw new ReplacementProbeValidationError("no_solution");
  }

  const byIndex = new Map(selection.selectedChoices.map((choice) => [choice.index, choice.prefixId]));
  const finalSentences = input.originalSentences.map((sentence, index) => {
    const prefixId = byIndex.get(index);
    return prefixId ? `${getStagingReplacementPrefix(prefixId)}${sentence}` : sentence;
  });
  const finalScript = finalSentences.join("\n");
  const finalLength = countCustomScriptCodePoints(finalScript);
  if (finalLength !== selection.finalLength) {
    throw new ReplacementProbeValidationError("final_validation");
  }
  try {
    const validated = validateCustomScriptDomainOutput({ status: "success", finalScript }, input.context);
    if (validated.status !== "success" || validated.finalScript !== finalScript) {
      throw new ReplacementProbeValidationError("final_validation");
    }
  } catch (error) {
    if (error instanceof ReplacementProbeValidationError) throw error;
    throw new ReplacementProbeValidationError(reasonFrom(error));
  }
  return { finalScript, finalLength, selectedChoices: selection.selectedChoices };
}

type ReplacementValidationContext = {
  objective: CustomScriptObjective;
  requestText: string;
  merchantProjectName: string;
  merchantProfileText: string;
};

function validateChoiceItem(value: unknown): {
  index: number;
  prefixIds: StagingReplacementPrefixId[];
} {
  if (!isRecord(value) || !hasExactKeys(value, ["index", "prefixIds"])) {
    throw new ReplacementProbeValidationError("choice_value");
  }
  if (!Number.isInteger(value.index) || !Array.isArray(value.prefixIds)) {
    throw new ReplacementProbeValidationError("choice_value");
  }
  if (value.prefixIds.length < 1 || value.prefixIds.length > 3) {
    throw new ReplacementProbeValidationError("prefix_ids_count");
  }
  if (!value.prefixIds.every(isStagingReplacementPrefixId)) {
    throw new ReplacementProbeValidationError("prefix_id_unknown");
  }
  const prefixIds = value.prefixIds as StagingReplacementPrefixId[];
  if (new Set(prefixIds).size !== prefixIds.length) {
    throw new ReplacementProbeValidationError("prefix_id_duplicate");
  }
  return {
    index: value.index as number,
    prefixIds: [...prefixIds].sort(compareStagingReplacementPrefixIds)
  };
}

function canonicalizeFinalizerCandidates(
  candidates: ReplacementCandidate[],
  originalSentences: string[],
  context: ReplacementValidationContext
) {
  const canonical: ReplacementCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates as unknown[]) {
    if (!isRecord(candidate) || !Number.isInteger(candidate.index) || !isStagingReplacementPrefixId(candidate.prefixId)) {
      throw new ReplacementProbeValidationError("final_validation");
    }
    const index = candidate.index as number;
    const prefixId = candidate.prefixId;
    const original = originalSentences[index];
    if (index < 0 || index >= replacementCount || typeof original !== "string") {
      throw new ReplacementProbeValidationError("final_validation");
    }
    const key = `${index}:${prefixId}`;
    if (seen.has(key)) continue;
    validateNonLengthDomain(`${getStagingReplacementPrefix(prefixId)}${original}`, context);
    seen.add(key);
    canonical.push({ index, prefixId });
  }
  return canonical;
}

function validateNonLengthDomain(finalScript: string, context: ReplacementValidationContext) {
  validateProbeSentenceLengths(finalScript);
  try {
    validateCustomScriptDomainOutput({ status: "success", finalScript }, context);
  } catch (error) {
    if (error instanceof CustomScriptValidationError && error.reason === "length") return;
    throw error;
  }
}

/** Keeps the isolated 24-sentence probe contract independent from product layout rules. */
function validateProbeSentenceLengths(finalScript: string) {
  for (const line of finalScript.split("\n")) {
    const content = line.replace(/[。！？!?]$/u, "").replace(/\p{White_Space}/gu, "");
    if (Array.from(content).length > 25) {
      throw new ReplacementProbeValidationError("sentence_length");
    }
  }
}

function validateDomain(value: unknown, context: ReplacementValidationContext) {
  try {
    return validateCustomScriptDomainOutput(value, context);
  } catch (error) {
    throw new ReplacementProbeValidationError(reasonFrom(error));
  }
}

function parseJsonObject(content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new ReplacementProbeValidationError("json_syntax");
  }
  if (!isRecord(parsed)) throw new ReplacementProbeValidationError("shape");
  return parsed;
}

function failedChoiceEvaluation(
  validationReason: ReplacementProbeValidationReason,
  jsonParsed = false
): PrefixChoiceEvaluation {
  return {
    jsonParsed,
    exact24: false,
    validCandidates: [],
    validChoiceCount: 0,
    reasonCounts: emptyReasonCounts(),
    validationReason
  };
}

function emptyReasonCounts(): ChoiceReasonCounts {
  return Object.fromEntries(choiceReasonKeys.map((key) => [key, 0])) as ChoiceReasonCounts;
}

function choiceReasonKey(reason: ReplacementProbeValidationReason): ChoiceReasonCountKey {
  return (choiceReasonKeys as readonly string[]).includes(reason)
    ? reason as ChoiceReasonCountKey
    : "other";
}

function reasonFrom(error: unknown): ReplacementProbeValidationReason {
  const reason = error instanceof ReplacementProbeValidationError || error instanceof CustomScriptValidationError
    ? error.reason
    : "shape";
  return (validationReasons as readonly string[]).includes(reason)
    ? reason as ReplacementProbeValidationReason
    : "shape";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
