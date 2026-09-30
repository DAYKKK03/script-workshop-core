import { setTimeout as sleep } from "node:timers/promises";
import { recordDeepSeekUsage } from "@/lib/usage/service";

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekJsonRequest = {
  messages: DeepSeekMessage[];
  temperature: number;
  maxAttempts?: number;
  timeoutMs?: number;
  maxTokens?: number;
  thinkingMode?: "disabled";
  allowEnvelopeRetry?: boolean;
  usageUserId?: string;
};

export type DeepSeekFailureSubreason =
  | "http_3xx"
  | "http_4xx"
  | "http_5xx"
  | "timeout"
  | "network_error"
  | "empty_content"
  | "provider_envelope_invalid_json"
  | "model_content_invalid_json"
  | "not_configured"
  | "unknown";

export type DeepSeekFailureDiagnostic = {
  providerSubreason: DeepSeekFailureSubreason;
  attempts: number;
  httpStatusClass?: string;
  model: string;
  baseHostPath: string;
  finishReason?: string;
  responseLengthBucket?: string;
  parseError?: "empty_content" | "truncated_json" | "json_syntax" | "html_body";
  requestPromptLengthBucket?: string;
  maxTokens?: number;
  responseContentTypeClass?: "json" | "text" | "html" | "other" | "unknown";
  responseDeclaredLengthBucket?: string;
  responseTransferClass?: "chunked" | "content_length" | "unknown";
  transportAttempts?: Array<{
    attempt: number;
    statusClass: string;
    contentTypeClass: "json" | "text" | "html" | "other" | "unknown";
    transferClass: "chunked" | "content_length" | "unknown";
    responseLengthBucket: string;
    elapsedMs: number;
    connectionMode: "default" | "close";
  }>;
  batchBudgetMs?: number;
  remainingBudgetBucket?: string;
  promptTokensBucket?: string;
  completionTokensBucket?: string;
  promptCacheHitTokensBucket?: string;
  promptCacheMissTokensBucket?: string;
  reasoningCharLengthBucket?: string;
  contentCharLengthBucket?: string;
  thinkingMode?: "omitted" | "disabled";
};

export type DeepSeekJsonResult =
  | {
      status: "success";
      content: string;
      diagnostic: Pick<DeepSeekFailureDiagnostic, "attempts" | "finishReason" | "responseLengthBucket" | "transportAttempts" | "batchBudgetMs" | "remainingBudgetBucket" | "promptTokensBucket" | "completionTokensBucket" | "promptCacheHitTokensBucket" | "promptCacheMissTokensBucket" | "reasoningCharLengthBucket" | "contentCharLengthBucket" | "thinkingMode" | "maxTokens" | "requestPromptLengthBucket" | "responseContentTypeClass" | "responseDeclaredLengthBucket" | "responseTransferClass">;
    }
  | {
      status: "blocked";
      errorCode: "AI_PROVIDER_NOT_CONFIGURED";
      message: string;
      diagnostic: DeepSeekFailureDiagnostic;
    }
  | {
      status: "failed";
      errorCode: "AI_PROVIDER_FAILED";
      message: string;
      diagnostic: DeepSeekFailureDiagnostic;
    };

const defaultBaseUrl = "https://api.deepseek.com";
const defaultModel = "deepseek-v4-flash";
const defaultTimeoutMs = 60_000;
const defaultMaxAttempts = 3;
const retryDelayMs = 250;

const providerNotConfiguredMessage =
  "AI 服务暂未配置，请先配置 DEEPSEEK_API_KEY";

export function getDeepSeekRuntimeSummary(
  env: Record<string, string | undefined> = process.env
) {
  const baseUrl = (env.DEEPSEEK_API_BASE_URL?.trim() || defaultBaseUrl).replace(
    /\/+$/,
    ""
  );
  let baseHostPath = "invalid";

  try {
    const parsed = new URL(baseUrl);
    baseHostPath = `${parsed.host}${parsed.pathname}`;
  } catch {
    // Keep invalid configuration observable without exposing its raw value.
  }

  return {
    model: env.DEEPSEEK_MODEL?.trim() || defaultModel,
    baseHostPath
  };
}

function getDeepSeekConfig(env: Record<string, string | undefined>) {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const runtime = getDeepSeekRuntimeSummary(env);
  const baseUrl = (env.DEEPSEEK_API_BASE_URL?.trim() || defaultBaseUrl).replace(
    /\/+$/,
    ""
  );
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS);

  return {
    apiKey,
    baseUrl,
    model: runtime.model,
    baseHostPath: runtime.baseHostPath,
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : defaultTimeoutMs
  };
}

export async function requestDeepSeekJson({
  messages,
  temperature,
  maxAttempts = defaultMaxAttempts,
  timeoutMs,
  maxTokens,
  thinkingMode,
  allowEnvelopeRetry = true,
  usageUserId
}: DeepSeekJsonRequest): Promise<DeepSeekJsonResult> {
  const runtime = getDeepSeekRuntimeSummary();
  const config = getDeepSeekConfig(process.env);

  if (!config) {
    return {
      status: "blocked",
      errorCode: "AI_PROVIDER_NOT_CONFIGURED",
      message: providerNotConfiguredMessage,
      diagnostic: {
        providerSubreason: "not_configured",
        attempts: 0,
        model: runtime.model,
        baseHostPath: runtime.baseHostPath
      }
    };
  }

  const attempts = Math.max(1, Math.min(maxAttempts, defaultMaxAttempts));
  const requestTimeoutMs = Number.isFinite(timeoutMs) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : config.timeoutMs;

  let envelopeRetryUsed = false;
  let envelopeRetryPending = false;
  let attempt = 0;
  const transportAttempts: NonNullable<DeepSeekFailureDiagnostic["transportAttempts"]> = [];
  const requestPromptLengthBucket = promptLengthBucket(messages);
  const normalizedMaxTokens = maxTokens ? Math.max(1, Math.min(Math.floor(maxTokens), 8192)) : undefined;
  const batchDeadlineAt = Date.now() + requestTimeoutMs;
  while (attempt < attempts || envelopeRetryPending) {
    attempt += 1;
    envelopeRetryPending = false;
    const controller = new AbortController();
    const remainingMs = Math.max(1, batchDeadlineAt - Date.now());
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    const requestStartedAt = Date.now();

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...(attempt > 1 && envelopeRetryUsed ? { Connection: "close", "Cache-Control": "no-store" } : {})
        },
        body: JSON.stringify({
          model: config.model,
          response_format: { type: "json_object" },
          messages,
          temperature,
          ...(normalizedMaxTokens ? { max_tokens: normalizedMaxTokens } : {})
          ,...(thinkingMode === "disabled" ? { thinking: { type: "disabled" } } : {})
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        await safeRecordDeepSeekUsage({ userId: usageUserId, success: false });

        if (isTransientHttpStatus(response.status) && attempt < attempts) {
          await sleep(retryDelayMs * attempt);
          continue;
        }

        return {
          status: "failed",
          errorCode: "AI_PROVIDER_FAILED",
          message: "AI 服务请求失败，请稍后重试",
          diagnostic: {
            providerSubreason: classifyHttpStatus(response.status),
            attempts: attempt,
            httpStatusClass: `${Math.floor(response.status / 100)}xx`,
            model: config.model,
            baseHostPath: config.baseHostPath,
            requestPromptLengthBucket,
            ...(normalizedMaxTokens ? { maxTokens: normalizedMaxTokens } : {})
          }
        };
      }

      let payload: {
        choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: unknown }>;
        usage?: {
          prompt_tokens?: unknown;
          completion_tokens?: unknown;
          prompt_cache_hit_tokens?: unknown;
          prompt_cache_miss_tokens?: unknown;
        };
      };

      let envelopeText = "";
      try {
        envelopeText = await response.text();
        payload = JSON.parse(envelopeText) as typeof payload;
      } catch {
        transportAttempts.push({
          attempt,
          statusClass: `${Math.floor(response.status / 100)}xx`,
          contentTypeClass: classifyContentType(response.headers.get("content-type")),
          transferClass: classifyTransfer(response.headers.get("transfer-encoding"), response.headers.get("content-length")),
          responseLengthBucket: lengthBucket(envelopeText.length),
          elapsedMs: Date.now() - requestStartedAt,
          connectionMode: attempt > 1 && envelopeRetryUsed ? "close" : "default"
        });
        await safeRecordDeepSeekUsage({ userId: usageUserId, success: false });
        if (allowEnvelopeRetry && !envelopeRetryUsed) {
          envelopeRetryUsed = true;
          envelopeRetryPending = true;
          await sleep(150);
          continue;
        }
        return failedDeepSeekResult("provider_envelope_invalid_json", attempt, config, undefined, {
          requestPromptLengthBucket,
          ...(normalizedMaxTokens ? { maxTokens: normalizedMaxTokens } : {}),
          responseLengthBucket: lengthBucket(envelopeText.length),
          parseError: classifyEnvelopeParseError(envelopeText),
          responseContentTypeClass: classifyContentType(response.headers.get("content-type")),
          responseDeclaredLengthBucket: declaredLengthBucket(response.headers.get("content-length")),
          responseTransferClass: classifyTransfer(response.headers.get("transfer-encoding"), response.headers.get("content-length")),
          transportAttempts,
          batchBudgetMs: requestTimeoutMs,
          remainingBudgetBucket: budgetBucket(Math.max(0, batchDeadlineAt - Date.now()))
        });
      }

      transportAttempts.push({
        attempt,
        statusClass: `${Math.floor(response.status / 100)}xx`,
        contentTypeClass: classifyContentType(response.headers.get("content-type")),
        transferClass: classifyTransfer(response.headers.get("transfer-encoding"), response.headers.get("content-length")),
        responseLengthBucket: lengthBucket(envelopeText.length),
        elapsedMs: Date.now() - requestStartedAt,
        connectionMode: attempt > 1 && envelopeRetryUsed ? "close" : "default"
      });
      const message = payload.choices?.[0]?.message;
      const promptTokens = toNonNegativeInteger(payload.usage?.prompt_tokens);
      const completionTokens = toNonNegativeInteger(payload.usage?.completion_tokens);
      const promptCacheHitTokens = toNonNegativeInteger(payload.usage?.prompt_cache_hit_tokens);
      const promptCacheMissTokens = toNonNegativeInteger(payload.usage?.prompt_cache_miss_tokens);
      const reasoningContent = typeof message?.reasoning_content === "string" ? message.reasoning_content : "";
      const contentValue = typeof message?.content === "string" ? message.content : "";
      await safeRecordDeepSeekUsage({
        userId: usageUserId,
        success: true,
        inputTokens: promptTokens,
        outputTokens: completionTokens
      });
      const content = message?.content;
      const finishReason = safeFinishReason(payload.choices?.[0]?.finish_reason);
      const responseMeta = {
        promptTokensBucket: tokenBucket(promptTokens),
        completionTokensBucket: tokenBucket(completionTokens),
        promptCacheHitTokensBucket: tokenBucket(promptCacheHitTokens),
        promptCacheMissTokensBucket: tokenBucket(promptCacheMissTokens),
        reasoningCharLengthBucket: lengthBucket(reasoningContent.length),
        contentCharLengthBucket: lengthBucket(contentValue.length),
        thinkingMode: thinkingMode ?? "omitted" as const
      };

      if (typeof content !== "string" || !content.trim()) {
        if (attempt < attempts) {
          continue;
        }

        return failedDeepSeekResult("empty_content", attempt, config, undefined, {
          requestPromptLengthBucket,
          ...(normalizedMaxTokens ? { maxTokens: normalizedMaxTokens } : {}),
          finishReason,
          responseLengthBucket: "0",
          parseError: "empty_content",
          responseContentTypeClass: classifyContentType(response.headers.get("content-type")),
          responseDeclaredLengthBucket: declaredLengthBucket(response.headers.get("content-length")),
          responseTransferClass: classifyTransfer(response.headers.get("transfer-encoding"), response.headers.get("content-length")),
          batchBudgetMs: requestTimeoutMs,
          remainingBudgetBucket: budgetBucket(Math.max(0, batchDeadlineAt - Date.now())),
          ...responseMeta
        });
      }

      const normalizedContent = extractJsonObject(content);
      try {
        JSON.parse(normalizedContent);
      } catch {
        if (attempt < attempts) {
          continue;
        }

        return failedDeepSeekResult("model_content_invalid_json", attempt, config, undefined, {
          requestPromptLengthBucket,
          ...(normalizedMaxTokens ? { maxTokens: normalizedMaxTokens } : {}),
          finishReason,
          responseLengthBucket: lengthBucket(content.length),
          parseError: finishReason === "length" || !normalizedContent.trim().endsWith("}") ? "truncated_json" : "json_syntax",
          responseContentTypeClass: classifyContentType(response.headers.get("content-type")),
          responseDeclaredLengthBucket: declaredLengthBucket(response.headers.get("content-length")),
          responseTransferClass: classifyTransfer(response.headers.get("transfer-encoding"), response.headers.get("content-length")),
          batchBudgetMs: requestTimeoutMs,
          remainingBudgetBucket: budgetBucket(Math.max(0, batchDeadlineAt - Date.now())),
          ...responseMeta
        });
      }

      return {
        status: "success",
        content: normalizedContent,
        diagnostic: { attempts: attempt, finishReason, responseLengthBucket: lengthBucket(content.length), transportAttempts, batchBudgetMs: requestTimeoutMs, remainingBudgetBucket: budgetBucket(Math.max(0, batchDeadlineAt - Date.now())), ...(normalizedMaxTokens ? { maxTokens: normalizedMaxTokens } : {}), requestPromptLengthBucket, responseContentTypeClass: classifyContentType(response.headers.get("content-type")), responseDeclaredLengthBucket: declaredLengthBucket(response.headers.get("content-length")), responseTransferClass: classifyTransfer(response.headers.get("transfer-encoding"), response.headers.get("content-length")), ...responseMeta }
      };
    } catch (error) {
      transportAttempts.push({
        attempt,
        statusClass: isAbortError(error) ? "timeout" : "network_error",
        contentTypeClass: "unknown",
        transferClass: "unknown",
        responseLengthBucket: "0",
        elapsedMs: Date.now() - requestStartedAt,
        connectionMode: attempt > 1 && envelopeRetryUsed ? "close" : "default"
      });
      await safeRecordDeepSeekUsage({ userId: usageUserId, success: false });
      const providerSubreason = isAbortError(error)
        ? "timeout"
        : "network_error";

      if (attempt < attempts) {
        await sleep(retryDelayMs * attempt);
        continue;
      }

      return failedDeepSeekResult(providerSubreason, attempt, config, undefined, {
        requestPromptLengthBucket,
        ...(normalizedMaxTokens ? { maxTokens: normalizedMaxTokens } : {}),
        transportAttempts,
        batchBudgetMs: requestTimeoutMs,
        remainingBudgetBucket: budgetBucket(Math.max(0, batchDeadlineAt - Date.now()))
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    status: "failed",
    errorCode: "AI_PROVIDER_FAILED",
    message: "AI 服务请求失败，请稍后重试",
    diagnostic: {
      providerSubreason: "unknown",
      attempts,
      model: config.model,
      baseHostPath: config.baseHostPath,
      requestPromptLengthBucket,
      ...(normalizedMaxTokens ? { maxTokens: normalizedMaxTokens } : {})
    }
  };
}

function budgetBucket(ms: number) {
  if (ms < 10_000) return "0-9999";
  if (ms < 20_000) return "10000-19999";
  if (ms < 30_000) return "20000-29999";
  return "30000+";
}

function tokenBucket(value: number) {
  if (value < 1) return "missing_or_zero";
  if (value < 1000) return "1-999";
  if (value < 5000) return "1000-4999";
  if (value < 10000) return "5000-9999";
  return "10000+";
}

function failedDeepSeekResult(
  providerSubreason: DeepSeekFailureSubreason,
  attempts: number,
  config: { model: string; baseHostPath: string },
  httpStatusClass?: string,
  extra?: Pick<DeepSeekFailureDiagnostic, "finishReason" | "responseLengthBucket" | "parseError" | "requestPromptLengthBucket" | "maxTokens" | "responseContentTypeClass" | "responseDeclaredLengthBucket" | "responseTransferClass" | "transportAttempts" | "batchBudgetMs" | "remainingBudgetBucket" | "promptTokensBucket" | "completionTokensBucket" | "promptCacheHitTokensBucket" | "promptCacheMissTokensBucket" | "reasoningCharLengthBucket" | "contentCharLengthBucket" | "thinkingMode">
): DeepSeekJsonResult {
  return {
    status: "failed",
    errorCode: "AI_PROVIDER_FAILED",
    message: "AI 服务请求失败，请稍后重试",
    diagnostic: {
      providerSubreason,
      attempts,
      httpStatusClass,
      model: config.model,
      baseHostPath: config.baseHostPath,
      ...extra
    }
  };
}

function safeFinishReason(value: unknown) {
  return typeof value === "string" && /^(stop|length|content_filter|tool_calls)$/.test(value) ? value : undefined;
}

function lengthBucket(length: number) {
  if (length < 1) return "0";
  if (length < 1_000) return "1-999";
  if (length < 3_000) return "1000-2999";
  if (length < 8_000) return "3000-7999";
  return "8000+";
}

function classifyEnvelopeParseError(content: string): "empty_content" | "html_body" | "json_syntax" {
  const trimmed = content.trim().toLowerCase();
  if (!trimmed) return "empty_content";
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html") || trimmed.startsWith("<head")) return "html_body";
  return "json_syntax";
}

function promptLengthBucket(messages: DeepSeekMessage[]) {
  const length = messages.reduce((total, message) => total + message.content.length, 0);
  if (length < 2_000) return "0-1999";
  if (length < 5_000) return "2000-4999";
  if (length < 10_000) return "5000-9999";
  return "10000+";
}

function classifyContentType(value: string | null): "json" | "text" | "html" | "other" | "unknown" {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType) return "unknown";
  if (contentType.includes("json")) return "json";
  if (contentType === "text/html") return "html";
  if (contentType.startsWith("text/")) return "text";
  return "other";
}

function declaredLengthBucket(value: string | null) {
  if (!value?.trim()) return "missing";
  const length = Number(value);
  return Number.isFinite(length) && length >= 0 ? lengthBucket(length) : "invalid";
}

function classifyTransfer(transferEncoding: string | null, contentLength: string | null): "chunked" | "content_length" | "unknown" {
  if (transferEncoding?.toLowerCase().includes("chunked")) return "chunked";
  if (contentLength?.trim()) return "content_length";
  return "unknown";
}

function classifyHttpStatus(status: number): DeepSeekFailureSubreason {
  const family = Math.floor(status / 100);
  if (family === 3) return "http_3xx";
  if (family === 4) return "http_4xx";
  if (family === 5) return "http_5xx";
  return "unknown";
}

function isTransientHttpStatus(status: number) {
  return status === 429 || (status >= 500 && status <= 599);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function safeRecordDeepSeekUsage(
  input: Parameters<typeof recordDeepSeekUsage>[0]
) {
  await recordDeepSeekUsage(input).catch(() => undefined);
}

function toNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

export function extractJsonObject(content: string) {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}
