import {
  requestDeepSeekJson,
  type DeepSeekJsonResult
} from "@/lib/ai/deepseek-runtime";
import {
  ReplacementProbeValidationError,
  evaluateStagingPrefixChoices,
  finalizeStagingReplacementScript,
  parseStagingReplacementBase,
  type ReplacementProbeValidationReason
} from "@/lib/custom-scripts/staging-replacement-probe-contract";
import {
  buildStagingReplacementBaseMessages,
  buildStagingReplacementProbeMessages
} from "@/lib/custom-scripts/staging-replacement-probe-prompt";
import {
  buildReplacementProbeFailureMetric,
  bucketChoiceReasonCounts,
  replacementCandidateCountBucket,
  replacementItemCountBucket,
  replacementLengthBucket,
  replacementProbeProviderReason,
  safeProviderDiagnostic,
  countBaseSentenceLengthBuckets,
  type ReplacementProbeMetric
} from "@/lib/custom-scripts/staging-replacement-probe-observability";
import { STAGING_SENTENCE_PROBE_REQUEST_TEXT } from "@/lib/custom-scripts/staging-sentence-probe-prompt";

export {
  ReplacementProbeValidationError,
  evaluateStagingPrefixChoices,
  finalizeStagingReplacementScript,
  selectDeterministicReplacementSubset
} from "@/lib/custom-scripts/staging-replacement-probe-contract";
export {
  buildStagingReplacementBaseMessages,
  buildStagingReplacementProbeMessages
} from "@/lib/custom-scripts/staging-replacement-probe-prompt";
export {
  countBaseSentenceLengthBuckets,
  safeProviderDiagnostic
} from "@/lib/custom-scripts/staging-replacement-probe-observability";

const probeSwitch = "STAGING";
const requiredModel = "deepseek-v4-flash";
const runLimit = 5;

export type StagingReplacementProbeProvider = (
  input: Parameters<typeof requestDeepSeekJson>[0]
) => Promise<DeepSeekJsonResult>;

/** Runs at most five serial two-call staging experiments and stops on the first failure. */
export async function runStagingReplacementProbeSeries(input: {
  env: Record<string, string | undefined>;
  runtimeModel: string;
  merchantProjectName: string;
  loadProfile: () => Promise<string | null | undefined>;
  provider?: StagingReplacementProbeProvider;
  writeLine?: (line: string) => void;
  now?: () => number;
}) {
  assertReplacementProbeGate(input.env, input.runtimeModel);
  const profileText = await input.loadProfile();
  if (!profileText?.trim()) throw new ReplacementProbeValidationError("profile_not_found");

  const provider = input.provider ?? requestDeepSeekJson;
  const writeLine = input.writeLine ?? ((line: string) => process.stdout.write(line));
  const now = input.now ?? Date.now;

  for (let runIndex = 1; runIndex <= runLimit; runIndex += 1) {
    const startedAt = now();
    const metric = await runOneReplacementProbe({
      runIndex,
      merchantProjectName: input.merchantProjectName,
      profileText,
      provider,
      startedAt,
      now
    });
    writeLine(`${JSON.stringify(metric)}\n`);
    if (metric.status !== "passed") {
      writeLine(`${JSON.stringify({ gate: false, runsCompleted: runIndex })}\n`);
      return { gate: false, runsCompleted: runIndex };
    }
  }

  writeLine(`${JSON.stringify({ gate: true, runsCompleted: runLimit })}\n`);
  return { gate: true, runsCompleted: runLimit };
}

async function runOneReplacementProbe(input: {
  runIndex: number;
  merchantProjectName: string;
  profileText: string;
  provider: StagingReplacementProbeProvider;
  startedAt: number;
  now: () => number;
}): Promise<ReplacementProbeMetric> {
  const context = {
    objective: "trust" as const,
    requestText: STAGING_SENTENCE_PROBE_REQUEST_TEXT,
    merchantProjectName: input.merchantProjectName,
    merchantProfileText: input.profileText
  };
  const firstResponse = await safeProviderCall(input.provider, {
    messages: buildStagingReplacementBaseMessages({ merchantProfileText: input.profileText }),
    temperature: 0.75,
    maxTokens: 1_600,
    maxAttempts: 1,
    allowEnvelopeRetry: false,
    thinkingMode: "disabled"
  });
  if (firstResponse.status !== "success") {
    return buildReplacementProbeFailureMetric({
      runIndex: input.runIndex,
      durationMs: elapsed(input),
      providerCalls: 1,
      validationReason: replacementProbeProviderReason(firstResponse.diagnostic),
      firstResponse
    });
  }

  let base: ReturnType<typeof parseStagingReplacementBase>;
  try {
    base = parseStagingReplacementBase(firstResponse.content, context);
  } catch (error) {
    return buildReplacementProbeFailureMetric({
      runIndex: input.runIndex,
      durationMs: elapsed(input),
      providerCalls: 1,
      validationReason: reasonFrom(error),
      firstResponse,
      baseJsonParsed: reasonFrom(error) !== "json_syntax",
      baseExact24: false
    });
  }

  // A base that is already longer than the product maximum cannot be repaired by
  // the replacement probe. Stop before sending the unneeded second request.
  if (base.length > 300) {
    return buildReplacementProbeFailureMetric({
      runIndex: input.runIndex,
      durationMs: elapsed(input),
      providerCalls: 1,
      validationReason: "base_over_length",
      firstResponse,
      baseJsonParsed: true,
      baseExact24: true,
      baseLength: base.length,
      baseSentenceLengthBuckets: countBaseSentenceLengthBuckets(base.sentences)
    });
  }

  const secondResponse = await safeProviderCall(input.provider, {
    messages: buildStagingReplacementProbeMessages({
      merchantProfileText: input.profileText,
      sentences: base.sentences
    }),
    temperature: 0.75,
    maxTokens: 1_600,
    maxAttempts: 1,
    allowEnvelopeRetry: false,
    thinkingMode: "disabled"
  });
  if (secondResponse.status !== "success") {
    return buildReplacementProbeFailureMetric({
      runIndex: input.runIndex,
      durationMs: elapsed(input),
      providerCalls: 2,
      validationReason: replacementProbeProviderReason(secondResponse.diagnostic),
      firstResponse,
      secondResponse,
      baseJsonParsed: true,
      baseExact24: true,
      baseLength: base.length
    });
  }

  const candidateEvaluation = evaluateStagingPrefixChoices(
    secondResponse.content,
    base.sentences,
    context
  );
  let selectedCount = 0;
  let finalLength: number | undefined;
  let validationReason = candidateEvaluation.validationReason;
  let status: ReplacementProbeMetric["status"] = "failed";
  if (candidateEvaluation.exact24 && candidateEvaluation.validChoiceCount === 24) {
    try {
      const result = finalizeStagingReplacementScript({
        originalSentences: base.sentences,
        candidates: candidateEvaluation.validCandidates,
        context
      });
      selectedCount = result.selectedChoices.length;
      finalLength = result.finalLength;
      validationReason = "none";
      status = "passed";
    } catch (error) {
      validationReason = reasonFrom(error);
    }
  }

  return {
    runIndex: input.runIndex,
    status,
    durationMs: elapsed(input),
    providerCalls: 2,
    baseJsonParsed: true,
    baseExact24: true,
    baseLengthBucket: replacementLengthBucket(base.length),
    baseSentenceLengthBuckets: countBaseSentenceLengthBuckets(base.sentences),
    choiceJsonParsed: candidateEvaluation.jsonParsed,
    choiceCountBucket: candidateEvaluation.exact24 ? "exact_24" : "not_24",
    validChoiceCountBucket: replacementItemCountBucket(candidateEvaluation.validChoiceCount),
    validCandidateCountBucket: replacementCandidateCountBucket(candidateEvaluation.validCandidates.length),
    reasonCountBuckets: bucketChoiceReasonCounts(candidateEvaluation.reasonCounts),
    selectedCountBucket: replacementItemCountBucket(selectedCount),
    finalLengthBucket: finalLength === undefined ? "not_assembled" : replacementLengthBucket(finalLength),
    validationReason,
    firstCall: safeProviderDiagnostic(firstResponse.diagnostic),
    secondCall: safeProviderDiagnostic(secondResponse.diagnostic)
  };
}

function assertReplacementProbeGate(env: Record<string, string | undefined>, runtimeModel: string) {
  if (env.CUSTOM_SCRIPT_REPLACEMENT_PROBE !== probeSwitch) {
    throw new ReplacementProbeValidationError("gate_disabled");
  }
  if (env.STAGING_ENABLE_REAL_PROVIDERS !== "1") {
    throw new ReplacementProbeValidationError("staging_provider_disabled");
  }
  if (runtimeModel !== requiredModel) throw new ReplacementProbeValidationError("model_mismatch");
}

async function safeProviderCall(
  provider: StagingReplacementProbeProvider,
  request: Parameters<StagingReplacementProbeProvider>[0]
) {
  try {
    return await provider(request);
  } catch {
    return providerFailureResult();
  }
}

function elapsed(input: { now: () => number; startedAt: number }) {
  return Math.max(0, input.now() - input.startedAt);
}

function reasonFrom(error: unknown): ReplacementProbeValidationReason {
  return error instanceof ReplacementProbeValidationError ? error.reason : "final_validation";
}

function providerFailureResult(): DeepSeekJsonResult {
  return {
    status: "failed",
    errorCode: "AI_PROVIDER_FAILED",
    message: "safe",
    diagnostic: {
      providerSubreason: "unknown",
      attempts: 1,
      model: requiredModel,
      baseHostPath: "hidden"
    }
  };
}
