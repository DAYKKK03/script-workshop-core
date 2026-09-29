export type MediaRelayConfig = {
  enabled: boolean;
  tempDir: string;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxDurationSeconds: number;
  downloadTimeoutMs: number;
  ffmpegTimeoutMs: number;
  maxRedirects: number;
  concurrency: number;
  ffmpegPath: string;
  objectPrefix: string;
  storage: MediaRelayStorageConfig;
  missingFields: string[];
};

export type MediaRelayStorageConfig = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

type RelayEnvironment = Record<string, string | undefined>;

const defaultMaxInputBytes = 120 * 1024 * 1024;
const defaultMaxOutputBytes = 25 * 1024 * 1024;
const defaultMaxDurationSeconds = 180;
const defaultDownloadTimeoutMs = 30_000;
const defaultFfmpegTimeoutMs = 90_000;
const defaultMaxRedirects = 3;
const defaultConcurrency = 1;

export function getMediaRelayConfig(
  env: RelayEnvironment = process.env
): MediaRelayConfig {
  const enabled = getBoolean(env.MEDIA_RELAY_ENABLED);
  const storage = {
    bucket: getTrimmed(env.COS_BUCKET),
    region: getTrimmed(env.COS_REGION),
    endpoint: getTrimmed(env.COS_ENDPOINT),
    accessKeyId: getTrimmed(env.COS_ACCESS_KEY_ID),
    secretAccessKey: getTrimmed(env.COS_SECRET_ACCESS_KEY),
    publicBaseUrl: getTrimmed(env.MEDIA_RELAY_PUBLIC_BASE_URL)
  };

  const missingFields = enabled
    ? [
        storage.bucket ? undefined : "COS_BUCKET",
        storage.region ? undefined : "COS_REGION",
        storage.endpoint ? undefined : "COS_ENDPOINT",
        storage.accessKeyId ? undefined : "COS_ACCESS_KEY_ID",
        storage.secretAccessKey ? undefined : "COS_SECRET_ACCESS_KEY",
        storage.publicBaseUrl ? undefined : "MEDIA_RELAY_PUBLIC_BASE_URL"
      ].filter(Boolean) as string[]
    : [];

  return {
    enabled,
    tempDir: getTrimmed(env.MEDIA_RELAY_TMP_DIR) || "/tmp/douyin-media-relay",
    maxInputBytes: getPositiveInteger(env.MEDIA_RELAY_MAX_INPUT_BYTES, defaultMaxInputBytes),
    maxOutputBytes: getPositiveInteger(env.MEDIA_RELAY_MAX_OUTPUT_BYTES, defaultMaxOutputBytes),
    maxDurationSeconds: getPositiveInteger(
      env.MEDIA_RELAY_MAX_DURATION_SECONDS,
      defaultMaxDurationSeconds
    ),
    downloadTimeoutMs: getPositiveInteger(
      env.MEDIA_RELAY_DOWNLOAD_TIMEOUT_MS,
      defaultDownloadTimeoutMs
    ),
    ffmpegTimeoutMs: getPositiveInteger(
      env.MEDIA_RELAY_FFMPEG_TIMEOUT_MS,
      defaultFfmpegTimeoutMs
    ),
    maxRedirects: getPositiveInteger(env.MEDIA_RELAY_MAX_REDIRECTS, defaultMaxRedirects),
    concurrency: getPositiveInteger(env.MEDIA_RELAY_CONCURRENCY, defaultConcurrency),
    ffmpegPath: getTrimmed(env.MEDIA_RELAY_FFMPEG_PATH) || "ffmpeg",
    objectPrefix: normalizeObjectPrefix(getTrimmed(env.MEDIA_RELAY_OBJECT_PREFIX) || "asr-relay"),
    storage,
    missingFields
  };
}

export function isMediaRelayConfigured(config = getMediaRelayConfig()) {
  return config.enabled && config.missingFields.length === 0;
}

function getBoolean(value: string | undefined) {
  return value?.trim() === "1" || value?.trim().toLowerCase() === "true";
}

function getTrimmed(value: string | undefined) {
  return value?.trim() || "";
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeObjectPrefix(value: string) {
  return value.replace(/^\/+|\/+$/g, "") || "asr-relay";
}
