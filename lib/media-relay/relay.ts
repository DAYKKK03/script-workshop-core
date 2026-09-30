import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMediaRelayConfig, type MediaRelayConfig } from "./config";
import { downloadMediaToTempFile, type DownloadDiagnostic } from "./download";
import { extractAudioWithFfmpeg, type FfmpegDiagnostic } from "./ffmpeg";
import {
  buildRelayObjectKey,
  deleteRelayObject,
  type RelayObjectDeleteResult,
  type RelayObjectUploadResult,
  uploadRelayObject
} from "./object-storage";
import type { HostResolver } from "./url-safety";

export type MediaRelayDiagnostic = {
  relayUsed: true;
  failureReason?: MediaRelayFailureReason;
  downloadStatusClass?: string;
  contentType?: string;
  sizeBucket?: string;
  durationBucket?: string;
  objectKeyHash8?: string;
  cleanupResult: "success" | "failed" | "not_needed";
  remoteDeleteAttempted?: boolean;
  remoteDeleteResult?: MediaRelayRemoteDeleteResult;
  objectStorageStatusClass?: string;
  objectStorageErrorCode?: string;
  objectStorageRequestIdHash8?: string;
};

export type MediaRelayRemoteDeleteResult =
  | "deleted"
  | "delete_failed"
  | "deferred_to_lifecycle";

export type MediaRelayFailureReason =
  | "relay_disabled"
  | "relay_not_configured"
  | "relay_invalid_url"
  | "relay_blocked_host"
  | "relay_unsupported_protocol"
  | "relay_download_failed"
  | "relay_content_type_rejected"
  | "relay_download_too_large"
  | "relay_ffmpeg_failed"
  | "relay_output_too_large"
  | "relay_object_upload_failed"
  | "relay_concurrency_limited";

export type MediaRelayResult =
  | {
      status: "success";
      url: string;
      format: "mp3";
      diagnostic: MediaRelayDiagnostic;
      cleanupRemoteObject: () => Promise<RelayObjectDeleteResult>;
    }
  | {
      status: "failed";
      reason: MediaRelayFailureReason;
      missingFields?: string[];
      diagnostic: MediaRelayDiagnostic;
    };

type MediaRelayDependencies = {
  fetchImpl?: typeof fetch;
  resolveHost?: HostResolver;
  config?: MediaRelayConfig;
};

let activeRelays = 0;

export async function relayMediaForAsr(
  sourceUrl: string,
  dependencies: MediaRelayDependencies = {}
): Promise<MediaRelayResult> {
  const config = dependencies.config || getMediaRelayConfig();
  const baseDiagnostic: MediaRelayDiagnostic = {
    relayUsed: true,
    cleanupResult: "not_needed"
  };

  if (!config.enabled) {
    return failedRelay("relay_disabled", baseDiagnostic);
  }

  if (config.missingFields.length > 0) {
    return {
      ...failedRelay("relay_not_configured", baseDiagnostic),
      missingFields: config.missingFields
    };
  }

  if (activeRelays >= config.concurrency) {
    return failedRelay("relay_concurrency_limited", baseDiagnostic);
  }

  activeRelays += 1;

  try {
    return await relayMediaWithCleanup(sourceUrl, config, dependencies);
  } finally {
    activeRelays = Math.max(0, activeRelays - 1);
  }
}

async function relayMediaWithCleanup(
  sourceUrl: string,
  config: MediaRelayConfig,
  dependencies: MediaRelayDependencies
): Promise<MediaRelayResult> {
  const workDir = path.join(config.tempDir || os.tmpdir(), randomUUID());
  const diagnostic: MediaRelayDiagnostic = {
    relayUsed: true,
    cleanupResult: "not_needed"
  };

  await mkdir(workDir, { recursive: true, mode: 0o700 });

  try {
    const download = await downloadMediaToTempFile({
      sourceUrl,
      workDir,
      config,
      fetchImpl: dependencies.fetchImpl,
      resolveHost: dependencies.resolveHost
    });
    mergeDownloadDiagnostic(diagnostic, download.diagnostic);

    if (download.status === "failed") {
      return failedRelay(mapDownloadFailure(download.reason), diagnostic);
    }

    const ffmpeg = await extractAudioWithFfmpeg({
      inputPath: download.filePath,
      workDir,
      config
    });
    mergeFfmpegDiagnostic(diagnostic, ffmpeg.diagnostic);

    if (ffmpeg.status === "failed") {
      return failedRelay(mapFfmpegFailure(ffmpeg.reason), diagnostic);
    }

    const objectKey = buildRelayObjectKey({
      prefix: config.objectPrefix,
      randomId: randomUUID()
    });
    diagnostic.objectKeyHash8 = hash8(objectKey);

    const upload = await uploadRelayObject({
      filePath: ffmpeg.outputPath,
      objectKey,
      contentType: "audio/mpeg",
      storage: config.storage
    });

    if (upload.status === "failed") {
      mergeObjectStorageUploadDiagnostic(diagnostic, upload);
      return failedRelay("relay_object_upload_failed", diagnostic);
    }

    return {
      status: "success",
      url: upload.publicUrl,
      format: "mp3",
      diagnostic,
      cleanupRemoteObject: () =>
        deleteRelayObject({
          objectKey,
          storage: config.storage
        })
    };
  } finally {
    diagnostic.cleanupResult = await cleanupWorkDir(workDir);
  }
}

/**
 * Performs best-effort remote cleanup only after the ASR lifecycle is known.
 * The emitted diagnostic intentionally contains no object key or URL.
 */
export async function finalizeMediaRelayRemoteCleanup(
  relayResult: Extract<MediaRelayResult, { status: "success" }>,
  deleteNow: boolean
) {
  const diagnostic = relayResult.diagnostic;
  diagnostic.remoteDeleteAttempted = deleteNow;

  if (!deleteNow) {
    diagnostic.remoteDeleteResult = "deferred_to_lifecycle";
    logRemoteCleanup(diagnostic);
    return diagnostic;
  }

  try {
    const result = await relayResult.cleanupRemoteObject();
    diagnostic.remoteDeleteResult =
      result.status === "success" ? "deleted" : "delete_failed";
  } catch {
    diagnostic.remoteDeleteResult = "delete_failed";
  }

  logRemoteCleanup(diagnostic);
  return diagnostic;
}

function logRemoteCleanup(diagnostic: MediaRelayDiagnostic) {
  console.info(
    JSON.stringify({
      event: "media_relay_remote_cleanup",
      deleteAttempted: diagnostic.remoteDeleteAttempted,
      deleteResult: diagnostic.remoteDeleteResult,
      objectKeyHash8: diagnostic.objectKeyHash8
    })
  );
}

function failedRelay(
  reason: MediaRelayFailureReason,
  diagnostic: MediaRelayDiagnostic
): Extract<MediaRelayResult, { status: "failed" }> {
  diagnostic.failureReason = reason;

  return {
    status: "failed",
    reason,
    diagnostic
  };
}

async function cleanupWorkDir(workDir: string) {
  try {
    await rm(workDir, { recursive: true, force: true });
    return "success" as const;
  } catch {
    return "failed" as const;
  }
}

function mergeDownloadDiagnostic(
  target: MediaRelayDiagnostic,
  source: DownloadDiagnostic
) {
  target.downloadStatusClass = source.statusClass;
  target.contentType = source.contentType;
  target.sizeBucket = source.sizeBucket;
}

function mergeFfmpegDiagnostic(
  target: MediaRelayDiagnostic,
  source: FfmpegDiagnostic
) {
  target.durationBucket = source.durationBucket;
  if (source.outputSizeBucket) {
    target.sizeBucket = source.outputSizeBucket;
  }
}

function mergeObjectStorageUploadDiagnostic(
  target: MediaRelayDiagnostic,
  source: Extract<RelayObjectUploadResult, { status: "failed" }>
) {
  target.objectStorageStatusClass = source.httpStatusClass;
  target.objectStorageErrorCode = source.providerErrorCode;
  target.objectStorageRequestIdHash8 = source.requestIdHash8;
}

function mapDownloadFailure(reason: string): MediaRelayFailureReason {
  if (reason === "invalid_url") return "relay_invalid_url";
  if (reason === "blocked_host") return "relay_blocked_host";
  if (reason === "unsupported_protocol") return "relay_unsupported_protocol";
  if (reason === "download_content_type") return "relay_content_type_rejected";
  if (reason === "download_too_large") return "relay_download_too_large";
  return "relay_download_failed";
}

function mapFfmpegFailure(reason: string): MediaRelayFailureReason {
  if (reason === "ffmpeg_output_too_large") return "relay_output_too_large";
  return "relay_ffmpeg_failed";
}

function hash8(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
