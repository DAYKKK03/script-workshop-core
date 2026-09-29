import { transcribeAuthorizedMediaUrl } from "../asr/volcengine-asr-provider";
import { isDouyinUrl } from "./source-input";
import {
  summarizeDiagnosticPayload,
  summarizeNormalizedUrl,
  type ExtractionFailureDiagnostic
} from "./diagnostics";
import {
  requestTikHubWithRetry,
  type TikHubRequestErrorCode
} from "./tikhub-request";
import {
  extractTikHubAuthorizedMedia,
  extractTikHubAuthorizedMediaCandidates,
  extractTikHubMediaDurationSeconds,
  summarizeTikHubAuthorizedMediaCandidates,
  type AuthorizedMediaFormat,
  type TikHubAuthorizedMedia
} from "./tikhub-media";
import { transcribeMediaCandidates } from "./media-transcription";
import { recordAsrUsage, recordTikHubUsage } from "@/lib/usage/service";

export { isDouyinUrl } from "./source-input";
export { douyinTranscriptFailureMessage } from "./transcript-constants";

export type DouyinTranscriptProviderName = "blocked" | "asr" | "tikhub";

export type DouyinTranscriptSource =
  | "provider_transcript"
  | "authorized_media_asr";

export type DouyinTranscriptErrorCode =
  | "PROVIDER_BLOCKED"
  | "INVALID_DOUYIN_URL"
  | "EXTRACTION_FAILED"
  | "EXTRACTION_TRANSCRIPT_EMPTY"
  | "ASR_PROVIDER_NOT_CONFIGURED"
  | "ASR_TRANSCRIPTION_FAILED"
  | "ASR_SUBMIT_FAILED"
  | "ASR_QUERY_REQUEST_FAILED"
  | "ASR_QUERY_TIMEOUT"
  | "ASR_PROVIDER_REJECTED"
  | "ASR_NO_AUDIO_TRACK"
  | "ASR_MEDIA_RELAY_NOT_CONFIGURED"
  | "ASR_MEDIA_RELAY_FAILED"
  | "TIKHUB_PROVIDER_NOT_CONFIGURED"
  | TikHubRequestErrorCode
  | "TIKHUB_PROVIDER_RESPONSE_UNSUPPORTED"
  | "TIKHUB_PROVIDER_FAILED";

export type DouyinTranscriptProviderResult =
  | {
      status: "success";
      originalTranscript: string;
      source: DouyinTranscriptSource;
      audioUrl?: string;
    }
  | {
      status: "blocked" | "failed";
      errorCode: DouyinTranscriptErrorCode;
      diagnostic?: ExtractionFailureDiagnostic;
    };

type UpstreamProviderResult =
  | {
      status: "success";
      transcript?: string;
      authorizedMediaUrl?: string;
      authorizedMediaFormat?: AuthorizedMediaFormat;
      authorizedMediaCandidates?: TikHubAuthorizedMedia[];
      authorizedMediaCandidateSummary?: ReturnType<
        typeof summarizeTikHubAuthorizedMediaCandidates
      >;
      authorizedMediaDurationSeconds?: number;
    }
  | {
      status: "blocked" | "failed";
      errorCode: DouyinTranscriptErrorCode;
      diagnostic?: ExtractionFailureDiagnostic;
    };

type AuthorizedAsrMediaInput = {
  mediaUrl: string;
  mediaFormat?: AuthorizedMediaFormat;
  mediaCandidates?: TikHubAuthorizedMedia[];
  mediaCandidateSummary?: ReturnType<typeof summarizeTikHubAuthorizedMediaCandidates>;
  mediaDurationSeconds?: number;
  source: "authorized_provider" | "owned_media";
  usageUserId?: string;
};

export type TikHubProviderStructure =
  | "transcript"
  | "media_url"
  | "unknown"
  | "not_configured"
  | "missing_test_url"
  | "disabled";

export type TikHubProviderTestModeResult = {
  status: "success" | "blocked" | "failed";
  structure: TikHubProviderStructure;
  transcriptFieldMatched: boolean;
  mediaUrlFieldMatched: boolean;
  failureType?: "http_status" | "request_failed" | "not_configured";
  httpStatus?: number;
  errorCode?:
    | "PROVIDER_DISABLED"
    | "TIKHUB_PROVIDER_NOT_CONFIGURED"
    | "TIKHUB_TEST_URL_REQUIRED"
    | "TIKHUB_PROVIDER_FAILED";
};

export type TikHubStabilityResultCategory =
  | "transcript"
  | "media_url"
  | "unknown"
  | "provider_error";

export type TikHubStabilityItem = {
  index: number;
  category: TikHubStabilityResultCategory;
  httpStatus?: number;
  transcriptExists: boolean;
  transcriptLength: number;
  mediaUrlMatched: boolean;
  needsAsr: boolean;
  canAnalyzeWithDeepSeek: boolean;
};

export type TikHubStabilitySummary = {
  linkCount: number;
  transcriptCount: number;
  mediaUrlCount: number;
  unknownCount: number;
  providerErrorCount: number;
  deepSeekAnalyzableCount: number;
  recommendation: "baseline_only" | "enter_p1_9" | "configure_asr" | "tune_provider";
  items: TikHubStabilityItem[];
};

const defaultProvider: DouyinTranscriptProviderName = "blocked";
const minimumTranscriptCharacters = 8;
const directTranscriptFieldKeys = [
  "transcript",
  "asrText",
  "asr_text",
  "resultText",
  "result_text",
  "utteranceText",
  "utterance_text"
];
const mediaUrlFieldKeys = [
  "authorizedMediaUrl",
  "authorized_media_url",
  "audioUrl",
  "audio_url",
  "videoUrl",
  "video_url",
  "mediaUrl",
  "media_url"
];
const tikHubFetchVideoPath = "/api/v1/douyin/web/fetch_one_video_by_share_url";
const defaultTikHubRequestTimeoutMs = 15_000;
const defaultTikHubRetryDelayMs = 500;
const deprecatedTikHubBaseUrlHosts = new Map([["mcp.tikhub.io", "api.tikhub.io"]]);

export function getDouyinProviderName(): DouyinTranscriptProviderName {
  const value = (
    process.env.DOUYIN_PROVIDER ||
    process.env.DOUYIN_TRANSCRIPT_PROVIDER ||
    defaultProvider
  )
    .trim()
    .toLowerCase();

  if (value === "asr" || value === "tikhub" || value === "blocked") {
    return value;
  }

  return defaultProvider;
}

export async function douyinTranscriptProvider(
  douyinUrl: string,
  usageUserId?: string
): Promise<DouyinTranscriptProviderResult> {
  const normalizedUrl = douyinUrl.trim();

  if (!normalizedUrl || !isDouyinUrl(normalizedUrl)) {
    return {
      status: "failed",
      errorCode: "INVALID_DOUYIN_URL"
    };
  }

  const providerName = getDouyinProviderName();

  if (providerName === "blocked") {
    return blockedProviderResult();
  }

  const upstreamResult =
    providerName === "tikhub"
      ? await tikhubDouyinProvider(normalizedUrl, usageUserId)
      : await serverAuthorizedMediaProvider();

  if (upstreamResult.status !== "success") {
    return upstreamResult;
  }

  const transcript = normalizeTranscript(upstreamResult.transcript);
  const mediaUrl = normalizeHttpUrl(upstreamResult.authorizedMediaUrl);

  // A media URL is authoritative: provider text can be a title, description,
  // or caption, so it must never bypass ASR when audio is available.
  if (mediaUrl) {
    return volcengineAsrTranscriptProvider({
      mediaUrl,
      mediaFormat: upstreamResult.authorizedMediaFormat,
      mediaCandidates: upstreamResult.authorizedMediaCandidates,
      mediaCandidateSummary: upstreamResult.authorizedMediaCandidateSummary,
      mediaDurationSeconds: upstreamResult.authorizedMediaDurationSeconds,
      source: "authorized_provider",
      usageUserId
    });
  }

  if (transcript) {
    return {
      status: "success",
      originalTranscript: transcript,
      source: "provider_transcript",
      audioUrl: upstreamResult.authorizedMediaUrl
    };
  }

  return {
    status: "failed",
    errorCode: "EXTRACTION_FAILED"
  };
}

function blockedProviderResult(): DouyinTranscriptProviderResult {
  // No compliant transcript provider is configured. Do not scrape, simulate
  // login, bypass platform limits, or pretend extraction succeeded.
  return {
    status: "blocked",
    errorCode: "PROVIDER_BLOCKED"
  };
}

async function serverAuthorizedMediaProvider(): Promise<UpstreamProviderResult> {
  const mediaUrl = normalizeHttpUrl(process.env.ASR_AUTHORIZED_MEDIA_URL);

  if (!mediaUrl) {
    return {
      status: "blocked",
      errorCode: "ASR_PROVIDER_NOT_CONFIGURED"
    };
  }

  return {
    status: "success",
    authorizedMediaUrl: mediaUrl
  };
}

export async function volcengineAsrTranscriptProvider({
  mediaUrl,
  mediaFormat,
  mediaCandidates,
  mediaCandidateSummary,
  mediaDurationSeconds = 0,
  usageUserId
}: AuthorizedAsrMediaInput): Promise<DouyinTranscriptProviderResult> {
  const normalizedMediaSummary = summarizeNormalizedUrl(mediaUrl);
  const result = mediaCandidates?.length
    ? await transcribeMediaCandidates({
        candidates: mediaCandidates,
        transcribe: async (candidate) => {
          const candidateResult = await transcribeAuthorizedMediaUrl(candidate);
          await safeRecordAsrUsage(
            usageUserId,
            candidateResult.status === "success",
            mediaDurationSeconds
          );
          return candidateResult;
        }
      })
    : await transcribeAuthorizedMediaUrl({ mediaUrl, mediaFormat }).then(
        async (singleResult) => {
          await safeRecordAsrUsage(
            usageUserId,
            singleResult.status === "success",
            mediaDurationSeconds
          );
          return singleResult;
        }
      );

  if (result.status === "blocked") {
    return {
      status: "blocked",
      errorCode: "ASR_PROVIDER_NOT_CONFIGURED"
    };
  }

  if (result.status === "failed") {
    return {
      status: "failed",
      errorCode: result.errorCode,
      diagnostic: {
        provider: "asr",
        failureCategory: classifyAsrFailureCategory(result),
        failureReason: result.failureReason,
        attempts: result.queryAttempts,
        httpStatus: result.httpStatus,
        retryable: isRetryableAsrFailure(result.errorCode),
        normalizedUrlLength: normalizedMediaSummary.length,
        normalizedUrlHash8: normalizedMediaSummary.hash8,
        selectedMediaKind: mediaCandidateSummary?.selectedMediaKind,
        selectedMediaFormat: mediaCandidateSummary?.selectedMediaFormat,
        selectedMediaPath: mediaCandidateSummary?.selectedMediaPath,
        candidateCount: mediaCandidateSummary?.candidateCount,
        candidateKinds: mediaCandidateSummary?.candidateKinds,
        candidateFormats: mediaCandidateSummary?.candidateFormats,
        candidatePaths: mediaCandidateSummary?.candidatePaths,
        relayUsed: result.relayDiagnostic?.relayUsed,
        relayFailureReason: result.relayDiagnostic?.failureReason,
        relayDownloadStatusClass: result.relayDiagnostic?.downloadStatusClass,
        relayContentType: result.relayDiagnostic?.contentType,
        relaySizeBucket: result.relayDiagnostic?.sizeBucket,
        relayDurationBucket: result.relayDiagnostic?.durationBucket,
        relayObjectKeyHash8: result.relayDiagnostic?.objectKeyHash8,
        relayCleanupResult: result.relayDiagnostic?.cleanupResult,
        relayRemoteDeleteAttempted:
          result.relayDiagnostic?.remoteDeleteAttempted,
        relayRemoteDeleteResult: result.relayDiagnostic?.remoteDeleteResult
      }
    };
  }

  if (result.status === "submitted") {
    return {
      status: "failed",
      errorCode: "ASR_QUERY_TIMEOUT",
      diagnostic: {
        provider: "asr",
        failureCategory: "transient",
        attempts: result.queryAttempts,
        retryable: true,
        normalizedUrlLength: normalizedMediaSummary.length,
        normalizedUrlHash8: normalizedMediaSummary.hash8,
        selectedMediaKind: mediaCandidateSummary?.selectedMediaKind,
        selectedMediaFormat: mediaCandidateSummary?.selectedMediaFormat,
        selectedMediaPath: mediaCandidateSummary?.selectedMediaPath,
        candidateCount: mediaCandidateSummary?.candidateCount,
        candidateKinds: mediaCandidateSummary?.candidateKinds,
        candidateFormats: mediaCandidateSummary?.candidateFormats,
        candidatePaths: mediaCandidateSummary?.candidatePaths,
        relayUsed: result.relayDiagnostic?.relayUsed,
        relayDownloadStatusClass: result.relayDiagnostic?.downloadStatusClass,
        relayContentType: result.relayDiagnostic?.contentType,
        relaySizeBucket: result.relayDiagnostic?.sizeBucket,
        relayDurationBucket: result.relayDiagnostic?.durationBucket,
        relayObjectKeyHash8: result.relayDiagnostic?.objectKeyHash8,
        relayCleanupResult: result.relayDiagnostic?.cleanupResult,
        relayRemoteDeleteAttempted:
          result.relayDiagnostic?.remoteDeleteAttempted,
        relayRemoteDeleteResult: result.relayDiagnostic?.remoteDeleteResult
      }
    };
  }

  return {
    status: "success",
    originalTranscript: result.transcript,
    source: "authorized_media_asr",
    audioUrl: mediaUrl
  };
}

function classifyAsrFailureCategory(result: {
  errorCode: DouyinTranscriptErrorCode;
  failureReason?: string;
  failureType?: string;
  httpStatus?: number;
}) {
  if (result.failureReason === "submit_auth_rejected") {
    return "auth" as const;
  }

  if (
    result.failureReason === "submit_rate_limited" ||
    result.failureReason === "submit_provider_unavailable" ||
    result.failureReason === "submit_timeout" ||
    result.failureReason === "submit_network"
  ) {
    return "transient" as const;
  }

  if (
    result.failureReason === "submit_invalid_response" ||
    result.failureType === "invalid_response"
  ) {
    return "response_unsupported" as const;
  }

  if (result.errorCode === "ASR_PROVIDER_REJECTED") {
    return "provider_failure" as const;
  }

  return "request" as const;
}

function isRetryableAsrFailure(errorCode: DouyinTranscriptErrorCode) {
  return errorCode === "ASR_SUBMIT_FAILED" || errorCode === "ASR_QUERY_REQUEST_FAILED" || errorCode === "ASR_QUERY_TIMEOUT";
}

async function tikhubDouyinProvider(
  douyinUrl: string,
  usageUserId?: string
): Promise<UpstreamProviderResult> {
  const apiKey = process.env.TIKHUB_API_KEY?.trim();
  const baseUrl = process.env.TIKHUB_API_BASE_URL?.trim();

  if (!apiKey || !baseUrl) {
    return {
      status: "blocked",
      errorCode: "TIKHUB_PROVIDER_NOT_CONFIGURED"
    };
  }

  try {
    const normalizedUrlSummary = summarizeNormalizedUrl(douyinUrl);
    const requestResult = await requestTikHubWithRetry({
      request: () => fetchTikHubVideo(baseUrl, douyinUrl, apiKey),
      retryDelayMs: getTikHubRetryDelayMs()
    });

    await recordTikHubUsage({
      userId: usageUserId,
      success: requestResult.status === "success",
      attempts: requestResult.attempts
    }).catch(() => undefined);

    if (requestResult.status === "failed") {
      return {
        status: "failed",
        errorCode: requestResult.errorCode,
        diagnostic: {
          provider: "tikhub",
          failureCategory: requestResult.failureCategory,
          attempts: requestResult.attempts,
          httpStatus: requestResult.httpStatus,
          retryable: requestResult.retryable,
          normalizedUrlLength: normalizedUrlSummary.length,
          normalizedUrlHash8: normalizedUrlSummary.hash8,
          responseBodyLength: requestResult.responseBodyLength,
          responseBodyHash8: requestResult.responseBodyHash8
        }
      };
    }

    const payload = await requestResult.response.json();
    const transcript = normalizeTranscript(
      findExplicitStringField(payload, directTranscriptFieldKeys)
    );
    const authorizedMediaCandidates =
      extractTikHubAuthorizedMediaCandidates(payload);
    const authorizedMediaCandidateSummary =
      summarizeTikHubAuthorizedMediaCandidates(authorizedMediaCandidates);
    const authorizedMediaDurationSeconds =
      extractTikHubMediaDurationSeconds(payload);
    const authorizedMedia =
      authorizedMediaCandidates[0] || extractTikHubAuthorizedMedia(payload);
    const authorizedMediaUrl =
      authorizedMedia?.url ||
      normalizeHttpUrl(findExplicitStringField(payload, mediaUrlFieldKeys));

    if (!transcript && !authorizedMediaUrl) {
      const payloadSummary = summarizeDiagnosticPayload(payload);
      return {
        status: "failed",
        errorCode: "TIKHUB_PROVIDER_RESPONSE_UNSUPPORTED",
        diagnostic: {
          provider: "tikhub",
          failureCategory: "response_unsupported",
          attempts: requestResult.attempts,
          retryable: false,
          normalizedUrlLength: normalizedUrlSummary.length,
          normalizedUrlHash8: normalizedUrlSummary.hash8,
          responseBodyLength: payloadSummary?.length,
          responseBodyHash8: payloadSummary?.hash8
        }
      };
    }

    return {
      status: "success",
      transcript,
      authorizedMediaUrl,
      authorizedMediaFormat: authorizedMedia?.format,
      authorizedMediaCandidates,
      authorizedMediaCandidateSummary,
      authorizedMediaDurationSeconds
    };
  } catch {
    return {
      status: "failed",
      errorCode: "TIKHUB_PROVIDER_REQUEST_FAILED",
      diagnostic: {
        provider: "tikhub",
        failureCategory: "provider_failure",
        retryable: false
      }
    };
  }
}

async function safeRecordAsrUsage(
  userId: string | undefined,
  success: boolean,
  audioSeconds: number
) {
  await recordAsrUsage({ userId, success, audioSeconds }).catch(() => undefined);
}

export async function runTikHubProviderTestMode(): Promise<TikHubProviderTestModeResult> {
  if (getDouyinProviderName() !== "tikhub") {
    return {
      status: "blocked",
      structure: "disabled",
      transcriptFieldMatched: false,
      mediaUrlFieldMatched: false,
      failureType: "not_configured",
      errorCode: "PROVIDER_DISABLED"
    };
  }

  const apiKey = process.env.TIKHUB_API_KEY?.trim();
  const baseUrl = process.env.TIKHUB_API_BASE_URL?.trim();

  if (!apiKey || !baseUrl) {
    return {
      status: "blocked",
      structure: "not_configured",
      transcriptFieldMatched: false,
      mediaUrlFieldMatched: false,
      failureType: "not_configured",
      errorCode: "TIKHUB_PROVIDER_NOT_CONFIGURED"
    };
  }

  const testUrl = process.env.TIKHUB_TEST_DOUYIN_URL?.trim();

  if (!testUrl || !isDouyinUrl(testUrl)) {
    return {
      status: "blocked",
      structure: "missing_test_url",
      transcriptFieldMatched: false,
      mediaUrlFieldMatched: false,
      failureType: "not_configured",
      errorCode: "TIKHUB_TEST_URL_REQUIRED"
    };
  }

  try {
    const response = await fetchTikHubVideo(baseUrl, testUrl, apiKey);

    if (!response.ok) {
      return {
        status: "failed",
        structure: "unknown",
        transcriptFieldMatched: false,
        mediaUrlFieldMatched: false,
        failureType: "http_status",
        httpStatus: response.status,
        errorCode: "TIKHUB_PROVIDER_FAILED"
      };
    }

    return summarizeTikHubPayload(await response.json());
  } catch {
    return {
      status: "failed",
      structure: "unknown",
      transcriptFieldMatched: false,
      mediaUrlFieldMatched: false,
      failureType: "request_failed",
      errorCode: "TIKHUB_PROVIDER_FAILED"
    };
  }
}

export async function runTikHubProviderStabilityTest(): Promise<TikHubStabilitySummary> {
  const links = getTikHubTestLinks();
  const items: TikHubStabilityItem[] = [];

  for (let index = 0; index < links.length; index += 1) {
    items.push(await runTikHubStabilityItem(index + 1, links[index]));
  }

  const transcriptCount = items.filter((item) => item.category === "transcript").length;
  const mediaUrlCount = items.filter((item) => item.category === "media_url").length;
  const unknownCount = items.filter((item) => item.category === "unknown").length;
  const providerErrorCount = items.filter(
    (item) => item.category === "provider_error"
  ).length;
  const deepSeekAnalyzableCount = items.filter(
    (item) => item.canAnalyzeWithDeepSeek
  ).length;

  return {
    linkCount: links.length,
    transcriptCount,
    mediaUrlCount,
    unknownCount,
    providerErrorCount,
    deepSeekAnalyzableCount,
    recommendation: getTikHubStabilityRecommendation({
      linkCount: links.length,
      transcriptCount,
      mediaUrlCount,
      unknownCount,
      providerErrorCount
    }),
    items
  };
}

function getTikHubTestLinks() {
  const rawLinks =
    process.env.TIKHUB_TEST_DOUYIN_URLS?.trim() ||
    process.env.TIKHUB_TEST_DOUYIN_URL?.trim() ||
    "";

  return rawLinks
    .split(/\|\||\r?\n/)
    .map((link) => link.trim())
    .filter((link) => link && isDouyinUrl(link));
}

async function runTikHubStabilityItem(
  index: number,
  douyinUrl: string
): Promise<TikHubStabilityItem> {
  const apiKey = process.env.TIKHUB_API_KEY?.trim();
  const baseUrl = process.env.TIKHUB_API_BASE_URL?.trim();

  if (!apiKey || !baseUrl) {
    return {
      index,
      category: "provider_error",
      transcriptExists: false,
      transcriptLength: 0,
      mediaUrlMatched: false,
      needsAsr: false,
      canAnalyzeWithDeepSeek: false
    };
  }

  try {
    const response = await fetchTikHubVideo(baseUrl, douyinUrl, apiKey);

    if (!response.ok) {
      return {
        index,
        category: "provider_error",
        httpStatus: response.status,
        transcriptExists: false,
        transcriptLength: 0,
        mediaUrlMatched: false,
        needsAsr: false,
        canAnalyzeWithDeepSeek: false
      };
    }

    const payload = await response.json();
    const transcript = normalizeTranscript(
      findExplicitStringField(payload, directTranscriptFieldKeys)
    );
    const mediaUrl = extractTikHubMediaUrl(payload);

    if (transcript) {
      return {
        index,
        category: "transcript",
        transcriptExists: true,
        transcriptLength: transcript.length,
        mediaUrlMatched: Boolean(mediaUrl),
        needsAsr: false,
        canAnalyzeWithDeepSeek: true
      };
    }

    if (mediaUrl) {
      return {
        index,
        category: "media_url",
        transcriptExists: false,
        transcriptLength: 0,
        mediaUrlMatched: true,
        needsAsr: true,
        canAnalyzeWithDeepSeek: false
      };
    }

    return {
      index,
      category: "unknown",
      transcriptExists: false,
      transcriptLength: 0,
      mediaUrlMatched: false,
      needsAsr: false,
      canAnalyzeWithDeepSeek: false
    };
  } catch {
    return {
      index,
      category: "provider_error",
      transcriptExists: false,
      transcriptLength: 0,
      mediaUrlMatched: false,
      needsAsr: false,
      canAnalyzeWithDeepSeek: false
    };
  }
}

function getTikHubStabilityRecommendation({
  linkCount,
  transcriptCount,
  mediaUrlCount,
  unknownCount,
  providerErrorCount
}: {
  linkCount: number;
  transcriptCount: number;
  mediaUrlCount: number;
  unknownCount: number;
  providerErrorCount: number;
}): TikHubStabilitySummary["recommendation"] {
  if (linkCount <= 1) {
    return "baseline_only";
  }

  if (transcriptCount / linkCount >= 0.6) {
    return "enter_p1_9";
  }

  if (mediaUrlCount > transcriptCount && mediaUrlCount >= unknownCount + providerErrorCount) {
    return "configure_asr";
  }

  return "tune_provider";
}

export function normalizeTikHubApiBaseUrl(baseUrl: string) {
  const normalizedBase = baseUrl.trim();
  const url = new URL(normalizedBase);
  const replacementHost = deprecatedTikHubBaseUrlHosts.get(url.host);

  if (replacementHost) {
    url.host = replacementHost;
  }

  return url.toString().replace(/\/+$/, "");
}

export function buildTikHubFetchVideoUrl(baseUrl: string, shareUrl: string) {
  const normalizedBaseUrl = normalizeTikHubApiBaseUrl(baseUrl);
  const url = new URL(tikHubFetchVideoPath, `${normalizedBaseUrl}/`);
  url.searchParams.set("share_url", shareUrl);
  return url.toString();
}

async function fetchTikHubVideo(
  baseUrl: string,
  douyinUrl: string,
  apiKey: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    getTikHubRequestTimeoutMs()
  );

  try {
    return await fetch(buildTikHubFetchVideoUrl(baseUrl, douyinUrl), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getTikHubRequestTimeoutMs() {
  return getPositiveInteger(
    process.env.TIKHUB_REQUEST_TIMEOUT_MS,
    defaultTikHubRequestTimeoutMs
  );
}

function getTikHubRetryDelayMs() {
  return getPositiveInteger(
    process.env.TIKHUB_RETRY_DELAY_MS,
    defaultTikHubRetryDelayMs
  );
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function summarizeTikHubPayload(payload: unknown): TikHubProviderTestModeResult {
  const transcript = normalizeTranscript(
    findExplicitStringField(payload, directTranscriptFieldKeys)
  );
  const mediaUrl = extractTikHubMediaUrl(payload);

  if (transcript) {
    return {
      status: "success",
      structure: "transcript",
      transcriptFieldMatched: true,
      mediaUrlFieldMatched: Boolean(mediaUrl)
    };
  }

  if (mediaUrl) {
    return {
      status: "success",
      structure: "media_url",
      transcriptFieldMatched: false,
      mediaUrlFieldMatched: true
    };
  }

  return {
    status: "failed",
    structure: "unknown",
    transcriptFieldMatched: false,
    mediaUrlFieldMatched: false,
    errorCode: "TIKHUB_PROVIDER_FAILED"
  };
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

function extractTikHubMediaUrl(payload: unknown) {
  return (
    extractTikHubAuthorizedMedia(payload)?.url ||
    normalizeHttpUrl(findExplicitStringField(payload, mediaUrlFieldKeys))
  );
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
