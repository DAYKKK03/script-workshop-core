import {
  finalizeMediaRelayRemoteCleanup,
  relayMediaForAsr,
  type MediaRelayDiagnostic,
  type MediaRelayResult
} from "@/lib/media-relay/relay";
import { getMediaRelayConfig } from "@/lib/media-relay/config";

type AsrEnvironment = Record<string, string | undefined>;

export type VolcengineAsrMediaFormat =
  | "mp3"
  | "wav"
  | "m4a"
  | "aac"
  | "ogg"
  | "mp4";

export type VolcengineAsrFailureCode =
  | "ASR_SUBMIT_FAILED"
  | "ASR_QUERY_REQUEST_FAILED"
  | "ASR_QUERY_TIMEOUT"
  | "ASR_PROVIDER_REJECTED"
  | "ASR_NO_AUDIO_TRACK"
  | "ASR_MEDIA_RELAY_NOT_CONFIGURED"
  | "ASR_MEDIA_RELAY_FAILED";

export type VolcengineAsrFailureReason =
  | "submit_endpoint_invalid"
  | "submit_endpoint_not_found"
  | "submit_auth_rejected"
  | "submit_rate_limited"
  | "submit_provider_unavailable"
  | "submit_unsupported_media"
  | "submit_request_rejected"
  | "submit_timeout"
  | "submit_network"
  | "submit_invalid_response";

export type VolcengineAsrResult =
  | {
      status: "success";
      transcript: string;
      relayDiagnostic?: MediaRelayDiagnostic;
    }
  | {
      status: "submitted";
      taskId?: string;
      requestId?: string;
      queryAttempts?: number;
      relayDiagnostic?: MediaRelayDiagnostic;
    }
  | {
      status: "blocked";
      errorCode: "ASR_PROVIDER_NOT_CONFIGURED";
      missingFields: string[];
    }
  | {
      status: "failed";
      errorCode: VolcengineAsrFailureCode;
      failureType:
        | "invalid_media_url"
        | "http_status"
        | "invalid_response"
        | "query_failed"
        | "request_failed";
      httpStatus?: number;
      queryAttempts?: number;
      failureReason?: VolcengineAsrFailureReason;
      relayDiagnostic?: MediaRelayDiagnostic;
      missingFields?: string[];
    };

type TranscribeAuthorizedMediaUrlInput = {
  mediaUrl: string;
  mediaFormat?: VolcengineAsrMediaFormat;
  env?: AsrEnvironment;
  fetchImpl?: typeof fetch;
  mediaRelay?: (mediaUrl: string) => Promise<MediaRelayResult>;
};

type VolcengineAsrConfig = ReturnType<typeof getVolcengineAsrConfig>;
type RelayFinalizableAsrResult = Exclude<
  VolcengineAsrResult,
  { status: "blocked" }
>;

const minimumTranscriptCharacters = 8;
const transcriptFieldKeys = [
  "transcript",
  "text",
  "caption",
  "subtitle",
  "asrText",
  "asr_text",
  "resultText",
  "result_text",
  "utteranceText",
  "utterance_text"
];

export function getVolcengineAsrConfig(env: AsrEnvironment = process.env) {
  const endpoint = getFirstEnvValue(env, [
    "VOLCENGINE_ASR_SUBMIT_ENDPOINT",
    "VOLCENGINE_ASR_ENDPOINT",
    "DOUBAO_ASR_ENDPOINT",
    "ASR_API_BASE_URL"
  ]);
  const token = getFirstEnvValue(env, [
    "VOLCENGINE_ASR_API_KEY",
    "VOLCENGINE_ASR_TOKEN",
    "DOUBAO_ASR_API_KEY",
    "ASR_API_KEY"
  ]);
  const resourceId =
    getFirstEnvValue(env, [
      "VOLCENGINE_ASR_RESOURCE_ID",
      "VOLCENGINE_RESOURCE_ID",
      "ASR_RESOURCE_ID"
    ]) || "volc.seedasr.auc";

  const missingFields = [
    endpoint ? undefined : "VOLCENGINE_ASR_ENDPOINT or ASR_API_BASE_URL",
    token ? undefined : "VOLCENGINE_ASR_API_KEY or ASR_API_KEY"
  ].filter(Boolean) as string[];

  return {
    endpoint,
    queryEndpoint:
      getFirstEnvValue(env, ["VOLCENGINE_ASR_QUERY_ENDPOINT"]) ||
      getVolcengineQueryEndpoint(endpoint),
    token,
    appId: getFirstEnvValue(env, ["VOLCENGINE_APP_ID", "ASR_APP_ID"]),
    cluster: getFirstEnvValue(env, ["VOLCENGINE_CLUSTER", "ASR_CLUSTER"]),
    resourceId,
    model:
      getFirstEnvValue(env, ["VOLCENGINE_ASR_MODEL", "ASR_MODEL"]) ||
      "bigmodel",
    queryMaxAttempts: getPositiveInteger(
      getFirstEnvValue(env, ["VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS"]),
      30
    ),
    queryIntervalMs: getPositiveInteger(
      getFirstEnvValue(env, ["VOLCENGINE_ASR_QUERY_INTERVAL_MS"]),
      3000
    ),
    requestTimeoutMs: getPositiveInteger(
      getFirstEnvValue(env, ["VOLCENGINE_ASR_REQUEST_TIMEOUT_MS"]),
      30_000
    ),
    missingFields
  };
}

export async function transcribeAuthorizedMediaUrl({
  mediaUrl,
  mediaFormat,
  env = process.env,
  fetchImpl = fetch,
  mediaRelay
}: TranscribeAuthorizedMediaUrlInput): Promise<VolcengineAsrResult> {
  let normalizedMediaUrl = normalizeHttpUrl(mediaUrl);

  if (!normalizedMediaUrl) {
    return {
      status: "failed",
      errorCode: "ASR_NO_AUDIO_TRACK",
      failureType: "invalid_media_url"
    };
  }

  const config = getVolcengineAsrConfig(env);
  let relayResult: MediaRelayResult | undefined;
  let submitMayBeProcessing = false;

  if (!config.endpoint || !config.token) {
    return {
      status: "blocked",
      errorCode: "ASR_PROVIDER_NOT_CONFIGURED",
      missingFields: config.missingFields
    };
  }

  if (!isValidHttpEndpoint(config.endpoint)) {
    return {
      status: "failed",
      errorCode: "ASR_SUBMIT_FAILED",
      failureType: "request_failed",
      failureReason: "submit_endpoint_invalid"
    };
  }

  try {
    relayResult = mediaRelay
      ? await mediaRelay(normalizedMediaUrl)
      : isMediaRelayEnabled(env)
        ? await relayMediaForAsr(normalizedMediaUrl, {
            config: getMediaRelayConfig(env),
            fetchImpl
          })
        : undefined;

    if (relayResult?.status === "failed") {
      return {
        status: "failed",
        errorCode:
          relayResult.reason === "relay_not_configured"
            ? "ASR_MEDIA_RELAY_NOT_CONFIGURED"
            : "ASR_MEDIA_RELAY_FAILED",
        failureType: "request_failed",
        relayDiagnostic: relayResult.diagnostic,
        missingFields: relayResult.missingFields
      };
    }

    if (relayResult?.status === "success") {
      normalizedMediaUrl = relayResult.url;
      mediaFormat = relayResult.format;
    }

    const requestId = globalThis.crypto?.randomUUID?.() || cryptoRandomId();
    submitMayBeProcessing = true;
    const response = await fetchWithTimeout(
      fetchImpl,
      config.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.token,
          "X-Api-Resource-Id": config.resourceId,
          "X-Api-Request-Id": requestId,
          "X-Api-Sequence": "-1",
          ...(config.appId ? { "X-App-Id": config.appId } : {}),
          ...(config.cluster ? { "X-Api-Cluster": config.cluster } : {})
        },
        body: JSON.stringify({
          user: {
            uid: "douyin-script-rewriter"
          },
          audio: {
            url: normalizedMediaUrl,
            format: mediaFormat || inferAudioFormat(normalizedMediaUrl),
            rate: 16000,
            bits: 16,
            channel: 1
          },
          request: {
            model_name: config.model,
            enable_itn: true,
            enable_punc: true,
            enable_ddc: false,
            enable_speaker_info: false,
            enable_channel_split: false,
            show_utterances: false,
            vad_segment: false,
            sensitive_words_filter: ""
          }
        })
      },
      config.requestTimeoutMs
    );

    if (!response.ok) {
      return finalizeVolcengineAsrResult(
        {
          status: "failed",
          errorCode: "ASR_SUBMIT_FAILED",
          failureType: "http_status",
          httpStatus: response.status,
          failureReason: classifySubmitHttpFailureReason(response.status)
        },
        relayResult,
        true
      );
    }

    const payload = await readJsonPayload(response);
    const responseRequestId =
      response.headers.get("x-api-request-id") ||
      response.headers.get("X-Api-Request-Id") ||
      requestId;
    const responseStatusCode = response.headers.get("x-api-status-code");
    const transcript = extractTranscriptFromAsrPayload(payload);

    if (responseStatusCode === "20000003") {
      return finalizeVolcengineAsrResult(
        {
          status: "failed",
          errorCode: "ASR_NO_AUDIO_TRACK",
          failureType: "invalid_response"
        },
        relayResult,
        true
      );
    }

    if (responseStatusCode && responseStatusCode !== "20000000") {
      return finalizeVolcengineAsrResult(
        {
          status: "failed",
          errorCode: "ASR_PROVIDER_REJECTED",
          failureType: "query_failed"
        },
        relayResult,
        true
      );
    }

    if (!transcript) {
      const taskId = findExplicitStringField(payload, [
        "task_id",
        "taskId",
        "id",
        "job_id",
        "jobId"
      ]);

      if (taskId || responseStatusCode === "20000000" || isSubmitAcceptedPayload(payload)) {
        const queryResult = await pollVolcengineAsrResult({
          config,
          fetchImpl,
          requestId: responseRequestId
        });
        const { terminal, ...resultWithoutTerminal } = queryResult;

        if (resultWithoutTerminal.status === "success") {
          return finalizeVolcengineAsrResult(
            resultWithoutTerminal,
            relayResult,
            terminal
          );
        }

        if (resultWithoutTerminal.status === "failed") {
          return finalizeVolcengineAsrResult(
            resultWithoutTerminal,
            relayResult,
            terminal
          );
        }

        return finalizeVolcengineAsrResult(
          {
            status: "submitted",
            taskId,
            requestId: responseRequestId,
            queryAttempts: resultWithoutTerminal.queryAttempts
          },
          relayResult,
          false
        );
      }

      submitMayBeProcessing = false;
      return finalizeVolcengineAsrResult(
        {
          status: "failed",
          errorCode: "ASR_SUBMIT_FAILED",
          failureType: "invalid_response",
          failureReason: "submit_invalid_response"
        },
        relayResult,
        true
      );
    }

    return finalizeVolcengineAsrResult(
      {
        status: "success",
        transcript
      },
      relayResult,
      true
    );
  } catch (error) {
    return finalizeVolcengineAsrResult(
      {
        status: "failed",
        errorCode: "ASR_SUBMIT_FAILED",
        failureType: "request_failed",
        failureReason: isAbortError(error) ? "submit_timeout" : "submit_network"
      },
      relayResult,
      !submitMayBeProcessing
    );
  }
}

async function finalizeVolcengineAsrResult(
  result: RelayFinalizableAsrResult,
  relayResult: MediaRelayResult | undefined,
  deleteNow: boolean
): Promise<VolcengineAsrResult> {
  if (!relayResult || relayResult.status !== "success") {
    return result;
  }

  const relayDiagnostic = await finalizeMediaRelayRemoteCleanup(
    relayResult,
    deleteNow
  );

  return {
    ...result,
    relayDiagnostic
  };
}

function isMediaRelayEnabled(env: AsrEnvironment) {
  const value = env.MEDIA_RELAY_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function getFirstEnvValue(env: AsrEnvironment, keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function isValidHttpEndpoint(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function classifySubmitHttpFailureReason(
  httpStatus: number
): VolcengineAsrFailureReason {
  if (httpStatus === 401 || httpStatus === 403) {
    return "submit_auth_rejected";
  }

  if (httpStatus === 404) {
    return "submit_endpoint_not_found";
  }

  if (httpStatus === 429) {
    return "submit_rate_limited";
  }

  if (httpStatus === 415 || httpStatus === 422) {
    return "submit_unsupported_media";
  }

  if (httpStatus >= 500) {
    return "submit_provider_unavailable";
  }

  return "submit_request_rejected";
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

async function pollVolcengineAsrResult({
  config,
  fetchImpl,
  requestId
}: {
  config: VolcengineAsrConfig;
  fetchImpl: typeof fetch;
  requestId: string;
}): Promise<
  | {
      status: "success";
      transcript: string;
      terminal: true;
    }
  | {
      status: "submitted";
      queryAttempts: number;
      terminal: false;
    }
  | {
      status: "failed";
      errorCode: VolcengineAsrFailureCode;
      failureType: "http_status" | "invalid_response" | "query_failed";
      httpStatus?: number;
      queryAttempts?: number;
      terminal: boolean;
    }
> {
  const queryEndpoint = config.queryEndpoint;
  const maxAttempts = config.queryMaxAttempts;
  const intervalMs = config.queryIntervalMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1 && intervalMs > 0) {
      await sleep(intervalMs);
    }

    let response: Response;
    let payload: unknown;

    try {
      response = await fetchWithTimeout(
        fetchImpl,
        queryEndpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": config.token || "",
            "X-Api-Resource-Id": config.resourceId,
            "X-Api-Request-Id": requestId,
            ...(config.appId ? { "X-App-Id": config.appId } : {}),
            ...(config.cluster ? { "X-Api-Cluster": config.cluster } : {})
          },
          body: JSON.stringify({})
        },
        config.requestTimeoutMs
      );
      payload = await readJsonPayload(response);
    } catch {
      return {
        status: "failed",
        errorCode: "ASR_QUERY_REQUEST_FAILED",
        failureType: "query_failed",
        queryAttempts: attempt,
        terminal: false
      };
    }

    const responseStatusCode = response.headers.get("x-api-status-code");
    const shouldRetryTransientProviderMiss =
      responseStatusCode === "45000006" && attempt < maxAttempts;

    if (shouldRetryTransientProviderMiss) {
      continue;
    }

    if (!response.ok) {
      return {
        status: "failed",
        errorCode: "ASR_QUERY_REQUEST_FAILED",
        failureType: "http_status",
        httpStatus: response.status,
        queryAttempts: attempt,
        terminal: false
      };
    }

    if (responseStatusCode === "20000001" || responseStatusCode === "20000002") {
      continue;
    }

    if (responseStatusCode === "20000003") {
      return {
        status: "failed",
        errorCode: "ASR_NO_AUDIO_TRACK",
        failureType: "invalid_response",
        queryAttempts: attempt,
        terminal: true
      };
    }

    if (responseStatusCode && responseStatusCode !== "20000000") {
      return {
        status: "failed",
        errorCode: "ASR_PROVIDER_REJECTED",
        failureType: "query_failed",
        queryAttempts: attempt,
        terminal: true
      };
    }

    const transcript = extractTranscriptFromAsrPayload(payload);

    if (transcript) {
      return {
        status: "success",
        transcript,
        terminal: true
      };
    }

    if (responseStatusCode === "20000000") {
      return {
        status: "failed",
        errorCode: "ASR_NO_AUDIO_TRACK",
        failureType: "invalid_response",
        queryAttempts: attempt,
        terminal: true
      };
    }
  }

  return {
    status: "failed",
    errorCode: "ASR_QUERY_TIMEOUT",
    failureType: "query_failed",
    queryAttempts: maxAttempts,
    terminal: false
  };
}

async function readJsonPayload(response: Response) {
  const body = await response.text();

  if (!body.trim()) {
    return {};
  }

  return JSON.parse(body) as unknown;
}

function getVolcengineQueryEndpoint(endpoint?: string) {
  if (!endpoint) {
    return "";
  }

  if (endpoint.endsWith("/submit")) {
    return `${endpoint.slice(0, -"/submit".length)}/query`;
  }

  return endpoint.replace(/\/submit(\?.*)?$/, "/query$1");
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function inferAudioFormat(urlValue: string) {
  try {
    const url = new URL(urlValue);
    const pathname = url.pathname.toLowerCase();
    const extension = pathname.match(/\.([a-z0-9]+)$/)?.[1];

    if (extension && ["mp3", "wav", "m4a", "aac", "ogg", "mp4"].includes(extension)) {
      return extension;
    }
  } catch {
    return "mp3";
  }

  return "mp3";
}

function isSubmitAcceptedPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const status = String(record.status || record.message || record.msg || "").toLowerCase();
  const code = record.code;

  return (
    code === 0 ||
    code === "0" ||
    status.includes("success") ||
    status.includes("submitted") ||
    status.includes("ok")
  );
}

function cryptoRandomId() {
  return `asr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractTranscriptFromAsrPayload(payload: unknown) {
  return (
    normalizeTranscript(findExplicitStringField(payload, transcriptFieldKeys)) ||
    normalizeTranscript(findUtteranceTranscript(payload))
  );
}

function findUtteranceTranscript(payload: unknown, depth = 0): string | undefined {
  if (!payload || depth > 4) {
    return undefined;
  }

  if (Array.isArray(payload)) {
    const utteranceTexts = payload
      .map((item) =>
        findExplicitStringField(item, [
          "text",
          "utteranceText",
          "utterance_text",
          "transcript"
        ])
      )
      .filter(Boolean) as string[];

    if (utteranceTexts.length > 0) {
      return utteranceTexts.join("");
    }

    for (const item of payload) {
      const nestedValue = findUtteranceTranscript(item, depth + 1);

      if (nestedValue) {
        return nestedValue;
      }
    }

    return undefined;
  }

  if (typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const utteranceKey = Object.keys(record).find(
    (key) =>
      key.toLowerCase() === "utterances" ||
      key.toLowerCase() === "utterance" ||
      key.toLowerCase() === "segments"
  );

  if (utteranceKey) {
    const value = findUtteranceTranscript(record[utteranceKey], depth + 1);

    if (value) {
      return value;
    }
  }

  for (const value of Object.values(record)) {
    const nestedValue = findUtteranceTranscript(value, depth + 1);

    if (nestedValue) {
      return nestedValue;
    }
  }

  return undefined;
}

function findExplicitStringField(
  payload: unknown,
  candidateKeys: string[],
  depth = 0
): string | undefined {
  if (!payload || depth > 4) {
    return undefined;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = findExplicitStringField(item, candidateKeys, depth + 1);

      if (value) {
        return value;
      }
    }

    return undefined;
  }

  if (typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const lowerKeyMap = new Map(
    Object.keys(record).map((key) => [key.toLowerCase(), key])
  );

  for (const candidateKey of candidateKeys) {
    const actualKey = lowerKeyMap.get(candidateKey.toLowerCase());
    const value = actualKey ? record[actualKey] : undefined;

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  for (const value of Object.values(record)) {
    const nestedValue = findExplicitStringField(value, candidateKeys, depth + 1);

    if (nestedValue) {
      return nestedValue;
    }
  }

  return undefined;
}

function normalizeTranscript(value?: string) {
  const transcript = value?.trim();

  if (!transcript) {
    return undefined;
  }

  const effectiveLength = transcript.replace(/\s/g, "").length;

  return effectiveLength >= minimumTranscriptCharacters ? transcript : undefined;
}

function normalizeHttpUrl(value?: string) {
  const normalizedUrl = value?.trim();

  if (!normalizedUrl) {
    return undefined;
  }

  try {
    const url = new URL(normalizedUrl);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}
