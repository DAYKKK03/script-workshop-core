import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { MediaRelayConfig } from "./config";
import {
  validateExternalMediaUrl,
  type HostResolver
} from "./url-safety";

export type DownloadDiagnostic = {
  statusClass?: string;
  contentType?: string;
  sizeBucket?: string;
  redirectCount: number;
};

export type DownloadResult =
  | {
      status: "success";
      filePath: string;
      bytes: number;
      contentType: string;
      finalUrl: URL;
      redirectCount: number;
      diagnostic: DownloadDiagnostic;
    }
  | {
      status: "failed";
      reason:
        | "invalid_url"
        | "blocked_host"
        | "unsupported_protocol"
        | "download_timeout"
        | "download_http_status"
        | "download_redirect_limit"
        | "download_content_type"
        | "download_too_large"
        | "download_stream_failed";
      diagnostic: DownloadDiagnostic;
    };

export async function downloadMediaToTempFile({
  sourceUrl,
  workDir,
  config,
  fetchImpl = fetch,
  resolveHost
}: {
  sourceUrl: string;
  workDir: string;
  config: Pick<
    MediaRelayConfig,
    "downloadTimeoutMs" | "maxInputBytes" | "maxRedirects"
  >;
  fetchImpl?: typeof fetch;
  resolveHost?: HostResolver;
}): Promise<DownloadResult> {
  await mkdir(workDir, { recursive: true, mode: 0o700 });

  let currentUrl = sourceUrl;
  let redirectCount = 0;
  const diagnostic: DownloadDiagnostic = { redirectCount };

  for (;;) {
    const safety = await validateExternalMediaUrl(currentUrl, resolveHost);
    if (safety.status === "failed") {
      return {
        status: "failed",
        reason: safety.reason,
        diagnostic
      };
    }

    const response = await fetchWithTimeout(
      fetchImpl,
      safety.url.toString(),
      { method: "GET", redirect: "manual" },
      config.downloadTimeoutMs
    ).catch((error) => {
      if (isAbortError(error)) {
        return "timeout" as const;
      }

      return "failed" as const;
    });

    if (response === "timeout") {
      return { status: "failed", reason: "download_timeout", diagnostic };
    }

    if (response === "failed") {
      return { status: "failed", reason: "download_stream_failed", diagnostic };
    }

    diagnostic.statusClass = `${Math.floor(response.status / 100)}xx`;
    diagnostic.redirectCount = redirectCount;

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location || redirectCount >= config.maxRedirects) {
        return {
          status: "failed",
          reason: "download_redirect_limit",
          diagnostic
        };
      }

      currentUrl = new URL(location, safety.url).toString();
      redirectCount += 1;
      diagnostic.redirectCount = redirectCount;
      continue;
    }

    if (!response.ok) {
      return { status: "failed", reason: "download_http_status", diagnostic };
    }

    const contentType = normalizeContentType(response.headers.get("content-type"));
    diagnostic.contentType = contentType || undefined;

    if (!isAllowedMediaContentType(contentType)) {
      return { status: "failed", reason: "download_content_type", diagnostic };
    }

    const contentLength = Number.parseInt(
      response.headers.get("content-length") || "",
      10
    );

    if (Number.isFinite(contentLength) && contentLength > config.maxInputBytes) {
      diagnostic.sizeBucket = sizeBucket(contentLength);
      return { status: "failed", reason: "download_too_large", diagnostic };
    }

    const filePath = path.join(workDir, `${randomUUID()}.media`);
    let bytes = 0;
    const file = await open(filePath, "w", 0o600);

    try {
      if (!response.body) {
        throw new Error("missing response body");
      }

      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > config.maxInputBytes) {
          throw new Error("download too large");
        }

        await file.write(value);
      }
    } catch (error) {
      await rm(filePath, { force: true }).catch(() => undefined);

      if (error instanceof Error && error.message === "download too large") {
        diagnostic.sizeBucket = sizeBucket(bytes);
        return { status: "failed", reason: "download_too_large", diagnostic };
      }

      return { status: "failed", reason: "download_stream_failed", diagnostic };
    } finally {
      await file.close().catch(() => undefined);
    }

    diagnostic.sizeBucket = sizeBucket(bytes);

    return {
      status: "success",
      filePath,
      bytes,
      contentType,
      finalUrl: safety.url,
      redirectCount,
      diagnostic
    };
  }
}

export function sizeBucket(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0";
  if (bytes < 1024 * 1024) return "<1MB";
  if (bytes < 10 * 1024 * 1024) return "1-9MB";
  if (bytes < 50 * 1024 * 1024) return "10-49MB";
  if (bytes < 100 * 1024 * 1024) return "50-99MB";
  return "100MB+";
}

function normalizeContentType(value: string | null) {
  return value?.split(";")[0].trim().toLowerCase() || "";
}

function isAllowedMediaContentType(value: string) {
  return (
    value.startsWith("audio/") ||
    value.startsWith("video/") ||
    value === "application/octet-stream" ||
    value === "binary/octet-stream"
  );
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
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
