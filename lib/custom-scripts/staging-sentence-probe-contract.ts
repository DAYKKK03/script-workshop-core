import {
  CustomScriptValidationError,
  validateCustomScriptDomainOutput,
  type CustomScriptObjective
} from "@/lib/custom-scripts/contracts";
import {
  countCustomScriptCodePoints,
  normalizeCustomScriptText
} from "@/lib/custom-scripts/text";

const sentenceCount = 24;
const terminalPunctuationPattern = /[。！？!?]/gu;
const validationReasons = [
  "none", "needs_profile", "gate_disabled", "staging_provider_disabled", "model_mismatch",
  "profile_not_found", "provider_failed", "empty_content", "json_syntax", "shape",
  "sentence_count", "sentence_value", "sentence_format", "sentence_length", "list_or_heading",
  "non_speech_content", "missing_facts_shape", "missing_facts_value", "length",
  "forbidden_expression", "fact_safety", "cta", "duplicate_previous", "duplicate_opening",
  "duplicate_body"
] as const;

export type ProbeValidationReason = (typeof validationReasons)[number];
export type ProbeStatus = "passed" | "failed" | "needs_profile" | "provider_failed";
export type ProbeLengthBucket =
  | "not_assembled"
  | "under_200"
  | "200_239"
  | "240_259"
  | "260_279"
  | "valid_280_300"
  | "301_320"
  | "321_360"
  | "over_360";

export type ProbeEvaluation = {
  status: ProbeStatus;
  jsonParsed: boolean;
  exact24: boolean;
  assembledLengthBucket: ProbeLengthBucket;
  sentenceMaxWithin25: boolean;
  punctuationOk: boolean;
  validationReason: ProbeValidationReason;
};

export class ProbeValidationError extends Error {
  constructor(public readonly reason: ProbeValidationReason) {
    super("STAGING_SENTENCE_PROBE_REJECTED");
  }
}

/** Validates each array item, then performs the only permitted transformation: join with newlines. */
export function assembleStagingProbeSentences(value: unknown) {
  if (!Array.isArray(value) || value.length !== sentenceCount) {
    throw new ProbeValidationError("sentence_count");
  }

  for (const sentence of value) {
    if (typeof sentence !== "string" || !normalizeCustomScriptText(sentence) || !/\p{Script=Han}/u.test(sentence)) {
      throw new ProbeValidationError("sentence_value");
    }
    if (sentence.includes("\n") || sentence.includes("\r")) {
      throw new ProbeValidationError("sentence_format");
    }
    const punctuation = sentence.match(terminalPunctuationPattern) ?? [];
    if (punctuation.length !== 1 || !/[。！？!?]$/u.test(sentence)) {
      throw new ProbeValidationError("sentence_format");
    }
    const content = sentence.replace(/[。！？!?]$/u, "").replace(/\p{White_Space}/gu, "");
    if (Array.from(content).length > 25) throw new ProbeValidationError("sentence_length");
    if (/^\s*(?:[#>*+-]|\d+[.)、])/u.test(sentence)) throw new ProbeValidationError("list_or_heading");
  }

  return value.join("\n");
}

/** Evaluates model content without returning or logging the assembled speech text. */
export function evaluateStagingSentenceProbeContent(
  content: string,
  context: {
    objective: CustomScriptObjective;
    requestText: string;
    merchantProjectName: string;
    merchantProfileText: string;
  }
): ProbeEvaluation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return failedEvaluation("json_syntax");
  }

  if (!isRecord(parsed) || typeof parsed.status !== "string") {
    return failedEvaluation("shape", { jsonParsed: true });
  }
  if (parsed.status === "needs_profile") return evaluateNeedsProfile(parsed, context);

  const sentences = parsed.sentences;
  const exact24 = Array.isArray(sentences) && sentences.length === sentenceCount;
  const sentenceMaxWithin25 = allSentencesWithinLimit(sentences);
  const punctuationOk = allSentencesHaveOneTerminalPunctuation(sentences);
  const observed = { jsonParsed: true, exact24, sentenceMaxWithin25, punctuationOk };
  if (parsed.status !== "success" || !hasExactKeys(parsed, ["status", "sentences"])) {
    return failedEvaluation("shape", observed);
  }

  let assembledScript: string;
  try {
    assembledScript = assembleStagingProbeSentences(sentences);
  } catch (error) {
    return failedEvaluation(validationReasonFrom(error), observed);
  }

  const assembledLength = countCustomScriptCodePoints(assembledScript);
  const assembledLengthBucket = bucketAssembledLength(assembledLength);
  // The historical probe keeps its own strict range after the product recovery band widens.
  if (assembledLength < 280 || assembledLength > 300) {
    return failedEvaluation("length", {
      jsonParsed: true,
      exact24: true,
      assembledLengthBucket,
      sentenceMaxWithin25: true,
      punctuationOk: true
    });
  }
  try {
    validateCustomScriptDomainOutput({ status: "success", finalScript: assembledScript }, context);
    return {
      status: "passed",
      jsonParsed: true,
      exact24: true,
      assembledLengthBucket,
      sentenceMaxWithin25: true,
      punctuationOk: true,
      validationReason: "none"
    };
  } catch (error) {
    return failedEvaluation(validationReasonFrom(error), {
      jsonParsed: true,
      exact24: true,
      assembledLengthBucket,
      sentenceMaxWithin25: true,
      punctuationOk: true
    });
  }
}

export function failedProbeEvaluation(
  validationReason: ProbeValidationReason,
  overrides: Partial<Omit<ProbeEvaluation, "validationReason">> = {}
): ProbeEvaluation {
  return failedEvaluation(validationReason, overrides);
}

function evaluateNeedsProfile(
  parsed: Record<string, unknown>,
  context: Parameters<typeof validateCustomScriptDomainOutput>[1]
): ProbeEvaluation {
  try {
    validateCustomScriptDomainOutput(parsed, context);
    return {
      status: "needs_profile",
      jsonParsed: true,
      exact24: false,
      assembledLengthBucket: "not_assembled",
      sentenceMaxWithin25: false,
      punctuationOk: false,
      validationReason: "needs_profile"
    };
  } catch (error) {
    return failedEvaluation(validationReasonFrom(error), { jsonParsed: true });
  }
}

function failedEvaluation(
  validationReason: ProbeValidationReason,
  overrides: Partial<Omit<ProbeEvaluation, "validationReason">> = {}
): ProbeEvaluation {
  return {
    status: "failed",
    jsonParsed: false,
    exact24: false,
    assembledLengthBucket: "not_assembled",
    sentenceMaxWithin25: false,
    punctuationOk: false,
    ...overrides,
    validationReason
  };
}

function validationReasonFrom(error: unknown): ProbeValidationReason {
  const reason = error instanceof ProbeValidationError || error instanceof CustomScriptValidationError
    ? error.reason
    : "shape";
  return (validationReasons as readonly string[]).includes(reason) ? reason as ProbeValidationReason : "shape";
}

function bucketAssembledLength(length: number): ProbeLengthBucket {
  if (length < 200) return "under_200";
  if (length < 240) return "200_239";
  if (length < 260) return "240_259";
  if (length < 280) return "260_279";
  if (length <= 300) return "valid_280_300";
  if (length <= 320) return "301_320";
  if (length <= 360) return "321_360";
  return "over_360";
}

function allSentencesWithinLimit(value: unknown) {
  return Array.isArray(value) && value.every((sentence) => {
    if (typeof sentence !== "string") return false;
    const content = sentence.replace(/[。！？!?]$/u, "").replace(/\p{White_Space}/gu, "");
    return Array.from(content).length <= 25;
  });
}

function allSentencesHaveOneTerminalPunctuation(value: unknown) {
  return Array.isArray(value) && value.every((sentence) =>
    typeof sentence === "string" &&
    (sentence.match(terminalPunctuationPattern) ?? []).length === 1 &&
    /[。！？!?]$/u.test(sentence)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
