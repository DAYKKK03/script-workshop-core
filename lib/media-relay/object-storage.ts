import COS from "cos-nodejs-sdk-v5";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MediaRelayStorageConfig } from "./config";

export type RelayObjectUploadResult =
  | {
      status: "success";
      objectKey: string;
      publicUrl: string;
    }
  | {
      status: "failed";
      reason: "object_upload_failed" | "object_invalid_config";
      httpStatusClass?: string;
      providerErrorCode?: string;
      requestIdHash8?: string;
    };

export type RelayObjectDeleteResult =
  | {
      status: "success";
    }
  | {
      status: "failed";
      reason: "object_delete_failed" | "object_invalid_config";
      httpStatusClass?: string;
      providerErrorCode?: string;
      requestIdHash8?: string;
    };

type CosObjectClient = Pick<COS, "putObject" | "deleteObject">;

type CosSdkError = {
  statusCode?: number;
  code?: string;
  RequestId?: string;
  headers?: Record<string, unknown>;
};

export async function uploadRelayObject({
  filePath,
  objectKey,
  contentType,
  storage,
  cosClient
}: {
  filePath: string;
  objectKey: string;
  contentType: string;
  storage: MediaRelayStorageConfig;
  cosClient?: CosObjectClient;
}): Promise<RelayObjectUploadResult> {
  if (!isValidStorageConfig(storage)) {
    return { status: "failed", reason: "object_invalid_config" };
  }

  const body = await readFile(filePath);
  const client = cosClient ?? createCosClient(storage);

  try {
    await client.putObject({
      Bucket: storage.bucket,
      Region: storage.region,
      Key: normalizeObjectKey(objectKey),
      Body: body,
      ContentLength: body.byteLength,
      ContentType: contentType
    });
  } catch (error) {
    const diagnostic = getCosErrorDiagnostic(error);
    return {
      status: "failed",
      reason: "object_upload_failed",
      ...diagnostic
    };
  }

  return {
    status: "success",
    objectKey,
    publicUrl: `${normalizePublicBaseUrl(storage.publicBaseUrl)}/${encodeObjectKeyPath(objectKey)}`
  };
}

/**
 * Deletes one relay object without returning or logging its raw key.
 */
export async function deleteRelayObject({
  objectKey,
  storage,
  cosClient
}: {
  objectKey: string;
  storage: MediaRelayStorageConfig;
  cosClient?: CosObjectClient;
}): Promise<RelayObjectDeleteResult> {
  if (!isValidStorageConfig(storage)) {
    return { status: "failed", reason: "object_invalid_config" };
  }

  const client = cosClient ?? createCosClient(storage);

  try {
    await client.deleteObject({
      Bucket: storage.bucket,
      Region: storage.region,
      Key: normalizeObjectKey(objectKey)
    });
  } catch (error) {
    const diagnostic = getCosErrorDiagnostic(error);
    return {
      status: "failed",
      reason: "object_delete_failed",
      ...diagnostic
    };
  }

  return { status: "success" };
}

export function buildRelayObjectKey({
  prefix,
  extension = "mp3",
  randomId
}: {
  prefix: string;
  extension?: string;
  randomId: string;
}) {
  const safePrefix = prefix.replace(/^\/+|\/+$/g, "") || "asr-relay";
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp3";
  const day = new Date().toISOString().slice(0, 10);

  return path.posix.join(safePrefix, day, `${randomId}.${safeExtension}`);
}

function encodeObjectKeyPath(value: string) {
  return value
    .split("/")
    .map((part) => camSafeUrlEncode(part))
    .join("/");
}

function camSafeUrlEncode(value: string) {
  return encodeURIComponent(value)
    .replaceAll("!", "%21")
    .replaceAll("'", "%27")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("*", "%2A");
}

function normalizePublicBaseUrl(value: string) {
  return value.replace(/\/+$/g, "");
}

function createCosClient(storage: MediaRelayStorageConfig): CosObjectClient {
  return new COS({
    SecretId: storage.accessKeyId,
    SecretKey: storage.secretAccessKey,
    Domain: `{Bucket}.${storage.endpoint}`,
    Protocol: "https:"
  });
}

function normalizeObjectKey(value: string) {
  return value.replace(/^\/+/g, "");
}

function getCosErrorDiagnostic(error: unknown) {
  const sdkError = isCosSdkError(error) ? error : {};
  return {
    httpStatusClass: getStatusClass(sdkError.statusCode),
    providerErrorCode: sdkError.code,
    requestIdHash8: getRequestIdHash8(sdkError)
  };
}

function isCosSdkError(error: unknown): error is CosSdkError {
  return typeof error === "object" && error !== null;
}

function getStatusClass(statusCode: number | undefined) {
  return typeof statusCode === "number"
    ? `${Math.floor(statusCode / 100)}xx`
    : undefined;
}

function getRequestIdHash8(error: CosSdkError) {
  const requestId =
    error.RequestId ||
    getHeaderValue(error.headers, "x-cos-request-id") ||
    getHeaderValue(error.headers, "x-cos-trace-id") ||
    getHeaderValue(error.headers, "x-request-id");

  return requestId ? createHash("sha256").update(requestId).digest("hex").slice(0, 8) : undefined;
}

function getHeaderValue(headers: Record<string, unknown> | undefined, name: string) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return typeof value === "string" ? value : undefined;
}

function isValidStorageConfig(storage: MediaRelayStorageConfig) {
  return Boolean(
    storage.bucket &&
      storage.region &&
      storage.endpoint &&
      storage.accessKeyId &&
      storage.secretAccessKey &&
      storage.publicBaseUrl
  );
}
