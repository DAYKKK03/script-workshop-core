import {
  requestDeepSeekJson,
  type DeepSeekFailureDiagnostic,
  type DeepSeekJsonResult
} from "@/lib/ai/deepseek-runtime";
import {
  CustomScriptValidationError,
  createCustomScriptLineCountBucket,
  validateCustomScriptDomainOutput,
  type CustomScriptDomainResult,
  type CustomScriptLengthBucket,
  type CustomScriptLengthDirection,
  type CustomScriptLineCountBucket,
  type CustomScriptObjective,
  type CustomScriptRepair,
  type CustomScriptValidationRepair,
  type CustomScriptTone
} from "@/lib/custom-scripts/contracts";
import { buildCustomScriptMessages } from "@/lib/custom-scripts/prompt";
import { countCustomScriptNonEmptyLines } from "@/lib/custom-scripts/text";

export type CustomScriptAttemptResult =
  | { status: "success"; result: CustomScriptDomainResult; diagnostic: SanitizedCustomScriptDiagnostic }
  | ({ status: "invalid"; diagnostic: SanitizedCustomScriptDiagnostic } & CustomScriptValidationRepair)
  | { status: "provider_failed"; errorCode: "CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE"; diagnostic: SanitizedCustomScriptDiagnostic };

export type SanitizedCustomScriptDiagnostic = Partial<Pick<
  DeepSeekFailureDiagnostic,
  | "providerSubreason"
  | "finishReason"
  | "responseLengthBucket"
  | "requestPromptLengthBucket"
  | "promptTokensBucket"
  | "completionTokensBucket"
  | "promptCacheHitTokensBucket"
  | "promptCacheMissTokensBucket"
  | "thinkingMode"
>> & {
  parserReason?: string;
  scriptLengthBucket?: CustomScriptLengthBucket;
  scriptLengthDirection?: CustomScriptLengthDirection;
  lineCountBucket?: CustomScriptLineCountBucket;
};

export type CustomScriptProvider = (input: Parameters<typeof requestDeepSeekJson>[0]) => Promise<DeepSeekJsonResult>;
type ProviderDiagnostic =
  | DeepSeekFailureDiagnostic
  | Extract<DeepSeekJsonResult, { status: "success" }>["diagnostic"];

/** Executes exactly one provider request; semantic retry belongs to the durable Job worker. */
export async function requestCustomScriptAttempt(
  input: {
    userId: string;
    merchantProjectName: string;
    merchantProfileText: string;
    requestText: string;
    objective: CustomScriptObjective;
    tone: CustomScriptTone;
    previousScript?: string;
    repair?: CustomScriptRepair;
    timeoutMs: number;
  },
  provider: CustomScriptProvider = requestDeepSeekJson
): Promise<CustomScriptAttemptResult> {
  const response = await provider({
    messages: buildCustomScriptMessages(input),
    temperature: input.repair ? 0.5 : 0.75,
    maxTokens: 1_600,
    maxAttempts: 1,
    allowEnvelopeRetry: false,
    thinkingMode: "disabled",
    timeoutMs: input.timeoutMs,
    usageUserId: input.userId
  });
  if (response.status !== "success") {
    const diagnostic = sanitizeDiagnostic(response.diagnostic);
    if (["empty_content", "model_content_invalid_json", "provider_envelope_invalid_json"].includes(response.diagnostic.providerSubreason)) {
      const reason = response.diagnostic.providerSubreason === "empty_content" ? "empty_content" : "json_syntax";
      return {
        status: "invalid",
        reason,
        diagnostic: { ...diagnostic, parserReason: reason }
      };
    }
    return { status: "provider_failed", errorCode: "CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE", diagnostic };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content) as unknown;
  } catch {
    return {
      status: "invalid",
      reason: "json_syntax",
      diagnostic: { ...sanitizeDiagnostic(response.diagnostic), parserReason: "json_syntax" }
    };
  }
  const lineCountBucket = deriveLineCountBucket(parsed);
  const invalidDiagnostic = {
    ...sanitizeDiagnostic(response.diagnostic),
    ...(lineCountBucket ? { lineCountBucket } : {})
  };
  try {
    const result = validateCustomScriptDomainOutput(parsed, input);
    return { status: "success", result, diagnostic: sanitizeDiagnostic(response.diagnostic) };
  } catch (error) {
    if (!(error instanceof CustomScriptValidationError)) {
      return {
        status: "invalid",
        reason: "json_syntax",
        diagnostic: { ...invalidDiagnostic, parserReason: "json_syntax" }
      };
    }
    if (error.reason === "length") {
      if (!error.repairContext) {
        return {
          status: "invalid",
          reason: "json_syntax",
          diagnostic: { ...invalidDiagnostic, parserReason: "json_syntax" }
        };
      }
      const diagnostic = {
          ...invalidDiagnostic,
          parserReason: "length",
          scriptLengthBucket: error.repairContext.lengthBucket,
          scriptLengthDirection: error.repairContext.direction
      };
      return {
        status: "invalid",
        reason: "length",
        repairContext: error.repairContext,
        repairMode: "fresh",
        diagnostic
      };
    }
    return {
      status: "invalid",
      reason: error.reason,
      diagnostic: { ...invalidDiagnostic, parserReason: error.reason }
    };
  }
}

function deriveLineCountBucket(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const finalScript = (value as Record<string, unknown>).finalScript;
  return typeof finalScript === "string"
    ? createCustomScriptLineCountBucket(countCustomScriptNonEmptyLines(finalScript))
    : undefined;
}

function sanitizeDiagnostic(diagnostic: ProviderDiagnostic) {
  const value = diagnostic as DeepSeekFailureDiagnostic;
  return {
    ...(value.providerSubreason ? { providerSubreason: value.providerSubreason } : {}),
    ...(value.finishReason ? { finishReason: value.finishReason } : {}),
    ...(value.responseLengthBucket ? { responseLengthBucket: value.responseLengthBucket } : {}),
    ...(value.requestPromptLengthBucket ? { requestPromptLengthBucket: value.requestPromptLengthBucket } : {}),
    ...(value.promptTokensBucket ? { promptTokensBucket: value.promptTokensBucket } : {}),
    ...(value.completionTokensBucket ? { completionTokensBucket: value.completionTokensBucket } : {}),
    ...(value.promptCacheHitTokensBucket ? { promptCacheHitTokensBucket: value.promptCacheHitTokensBucket } : {}),
    ...(value.promptCacheMissTokensBucket ? { promptCacheMissTokensBucket: value.promptCacheMissTokensBucket } : {}),
    ...(value.thinkingMode ? { thinkingMode: value.thinkingMode } : {})
  };
}
