import {
  requestDeepSeekJson,
  type DeepSeekFailureDiagnostic,
  type DeepSeekJsonResult
} from "@/lib/ai/deepseek-runtime";
import {
  evaluateStagingSentenceProbeContent,
  failedProbeEvaluation,
  ProbeValidationError,
  type ProbeEvaluation,
  type ProbeValidationReason
} from "@/lib/custom-scripts/staging-sentence-probe-contract";
import {
  buildStagingSentenceProbeMessages,
  STAGING_SENTENCE_PROBE_REQUEST_TEXT
} from "@/lib/custom-scripts/staging-sentence-probe-prompt";

export {
  assembleStagingProbeSentences,
  evaluateStagingSentenceProbeContent,
  ProbeValidationError
} from "@/lib/custom-scripts/staging-sentence-probe-contract";
export { buildStagingSentenceProbeMessages } from "@/lib/custom-scripts/staging-sentence-probe-prompt";

const probeSwitch = "STAGING";
const requiredModel = "deepseek-v4-flash";
const runLimit = 5;

type ProbeMetric = ProbeEvaluation & {
  runIndex: number;
  durationMs: number;
  finishReason: string;
  responseLengthBucket: string;
  parseError: string;
  promptTokensBucket: string;
  completionTokensBucket: string;
  promptCacheHitTokensBucket: string;
  promptCacheMissTokensBucket: string;
};

export type StagingSentenceProbeProvider = (
  input: Parameters<typeof requestDeepSeekJson>[0]
) => Promise<DeepSeekJsonResult>;

/** Runs a maximum of five serial staging probes and stops on the first non-pass result. */
export async function runStagingSentenceProbeSeries(input: {
  env: Record<string, string | undefined>;
  runtimeModel: string;
  merchantProjectName: string;
  loadProfile: () => Promise<string | null | undefined>;
  provider?: StagingSentenceProbeProvider;
  writeLine?: (line: string) => void;
  now?: () => number;
}) {
  assertProbeGate(input.env, input.runtimeModel);
  const profileText = await input.loadProfile();
  if (!profileText?.trim()) throw new ProbeValidationError("profile_not_found");

  const provider = input.provider ?? requestDeepSeekJson;
  const writeLine = input.writeLine ?? ((line: string) => process.stdout.write(line));
  const now = input.now ?? Date.now;
  let runsCompleted = 0;

  for (let runIndex = 1; runIndex <= runLimit; runIndex += 1) {
    const startedAt = now();
    let response: DeepSeekJsonResult;
    try {
      response = await provider({
        messages: buildStagingSentenceProbeMessages({ merchantProfileText: profileText }),
        temperature: 0.75,
        maxTokens: 1_600,
        maxAttempts: 1,
        allowEnvelopeRetry: false,
        thinkingMode: "disabled"
      });
    } catch {
      response = providerFailureResult();
    }

    const metric = buildProbeMetric(
      runIndex,
      Math.max(0, now() - startedAt),
      response,
      input.merchantProjectName,
      profileText
    );
    runsCompleted = runIndex;
    writeLine(`${JSON.stringify(metric)}\n`);
    if (metric.status !== "passed") {
      writeLine(`${JSON.stringify({ gate: false, runsCompleted })}\n`);
      return { gate: false, runsCompleted };
    }
  }

  writeLine(`${JSON.stringify({ gate: true, runsCompleted })}\n`);
  return { gate: true, runsCompleted };
}

function assertProbeGate(env: Record<string, string | undefined>, runtimeModel: string) {
  if (env.CUSTOM_SCRIPT_SENTENCE_PROBE !== probeSwitch) {
    throw new ProbeValidationError("gate_disabled");
  }
  if (env.STAGING_ENABLE_REAL_PROVIDERS !== "1") {
    throw new ProbeValidationError("staging_provider_disabled");
  }
  if (runtimeModel !== requiredModel) {
    throw new ProbeValidationError("model_mismatch");
  }
}

function buildProbeMetric(
  runIndex: number,
  durationMs: number,
  response: DeepSeekJsonResult,
  merchantProjectName: string,
  merchantProfileText: string
): ProbeMetric {
  const evaluation = response.status === "success"
    ? evaluateContent(response.content, merchantProjectName, merchantProfileText)
    : failedProbeEvaluation(providerValidationReason(response.diagnostic), { status: "provider_failed" });
  const diagnostic = response.diagnostic as DeepSeekFailureDiagnostic;
  return {
    runIndex,
    status: evaluation.status,
    durationMs,
    jsonParsed: evaluation.jsonParsed,
    exact24: evaluation.exact24,
    assembledLengthBucket: evaluation.assembledLengthBucket,
    sentenceMaxWithin25: evaluation.sentenceMaxWithin25,
    punctuationOk: evaluation.punctuationOk,
    validationReason: evaluation.validationReason,
    finishReason: allowlistedFinishReason(diagnostic.finishReason),
    responseLengthBucket: allowlistedResponseLengthBucket(diagnostic.responseLengthBucket),
    parseError: allowlistedParseError(diagnostic.parseError),
    promptTokensBucket: allowlistedTokenBucket(diagnostic.promptTokensBucket),
    completionTokensBucket: allowlistedTokenBucket(diagnostic.completionTokensBucket),
    promptCacheHitTokensBucket: allowlistedTokenBucket(diagnostic.promptCacheHitTokensBucket),
    promptCacheMissTokensBucket: allowlistedTokenBucket(diagnostic.promptCacheMissTokensBucket)
  };
}

function evaluateContent(content: string, merchantProjectName: string, merchantProfileText: string) {
  return evaluateStagingSentenceProbeContent(content, {
    objective: "trust",
    requestText: STAGING_SENTENCE_PROBE_REQUEST_TEXT,
    merchantProjectName,
    merchantProfileText
  });
}

function providerValidationReason(diagnostic: DeepSeekFailureDiagnostic): ProbeValidationReason {
  if (diagnostic.providerSubreason === "empty_content") return "empty_content";
  if (
    diagnostic.providerSubreason === "model_content_invalid_json" ||
    diagnostic.providerSubreason === "provider_envelope_invalid_json"
  ) return "json_syntax";
  return "provider_failed";
}

function allowlistedFinishReason(value: unknown) {
  return typeof value === "string" && ["stop", "length", "content_filter", "tool_calls"].includes(value)
    ? value
    : "unknown";
}

function allowlistedResponseLengthBucket(value: unknown) {
  return typeof value === "string" && ["0", "1-999", "1000-2999", "3000-7999", "8000+"].includes(value)
    ? value
    : "unknown";
}

function allowlistedParseError(value: unknown) {
  return typeof value === "string" && ["empty_content", "truncated_json", "json_syntax", "html_body"].includes(value)
    ? value
    : "none";
}

function allowlistedTokenBucket(value: unknown) {
  return typeof value === "string" && ["missing_or_zero", "1-999", "1000-4999", "5000-9999", "10000+"].includes(value)
    ? value
    : "unknown";
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
