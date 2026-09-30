import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getMediaRelayConfig,
  type MediaRelayConfig
} from "../../lib/media-relay/config.ts";
import { downloadMediaToTempFile } from "../../lib/media-relay/download.ts";
import {
  deleteRelayObject,
  uploadRelayObject
} from "../../lib/media-relay/object-storage.ts";
import { relayMediaForAsr } from "../../lib/media-relay/relay.ts";

test("rejects private media hosts before download", async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "relay-private-"));

  try {
    let fetchCalled = false;
    const result = await downloadMediaToTempFile({
      sourceUrl: "https://cdn.example.test/video.mp4",
      workDir,
      config: {
        downloadTimeoutMs: 100,
        maxInputBytes: 1024,
        maxRedirects: 1
      },
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response("should-not-fetch");
      },
      resolveHost: async () => [{ address: "127.0.0.1", family: 4 }]
    });

    assert.equal(result.status, "failed");
    assert.equal("reason" in result ? result.reason : null, "blocked_host");
    assert.equal(fetchCalled, false);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("rejects non-media content-types without writing a file", async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "relay-type-"));

  try {
    const result = await downloadMediaToTempFile({
      sourceUrl: "https://cdn.example.test/page",
      workDir,
      config: {
        downloadTimeoutMs: 100,
        maxInputBytes: 1024,
        maxRedirects: 1
      },
      fetchImpl: async () =>
        new Response("not media", {
          status: 200,
          headers: { "content-type": "text/html" }
        }),
      resolveHost: async () => [{ address: "8.8.8.8", family: 4 }]
    });

    assert.equal(result.status, "failed");
    assert.equal("reason" in result ? result.reason : null, "download_content_type");
    assert.deepEqual(await readdir(workDir), []);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("cleans temporary files when ffmpeg fails", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "relay-cleanup-"));
  const config = relayTestConfig(tempRoot, {
    MEDIA_RELAY_FFMPEG_PATH: "missing-ffmpeg-for-test"
  });

  try {
    const result = await relayMediaForAsr("https://cdn.example.test/video.mp4", {
      config,
      fetchImpl: async () =>
        new Response(Buffer.from("fake-video"), {
          status: 200,
          headers: { "content-type": "video/mp4" }
        }),
      resolveHost: async () => [{ address: "8.8.8.8", family: 4 }]
    });

    assert.equal(result.status, "failed");
    assert.equal("reason" in result ? result.reason : null, "relay_ffmpeg_failed");
    assert.equal(result.diagnostic.cleanupResult, "success");
    assert.deepEqual(await readdir(tempRoot), []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("reports object upload failures without exposing object keys", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "relay-upload-"));
  const filePath = path.join(tempRoot, "a.mp3");
  let capturedParams:
    | {
        Bucket?: string;
        Region?: string;
        Key?: string;
        ContentLength?: number;
        ContentType?: string;
      }
    | undefined;

  try {
    await writeFile(filePath, Buffer.from("audio"));

    const result = await uploadRelayObject({
      filePath,
      objectKey: "/asr-relay/test/private-key.mp3",
      contentType: "audio/mpeg",
      storage: {
        bucket: "bucket-1234567890",
        region: "ap-hongkong",
        endpoint: "cos.ap-hongkong.myqcloud.com",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        publicBaseUrl: "https://media.example.test"
      },
      cosClient: {
        putObject: async (params) => {
          capturedParams = params;
          throw {
            statusCode: 403,
            code: "AccessDenied",
            RequestId: "request-id-for-hash"
          };
        },
        deleteObject: async () => ({})
      }
    });

    assert.equal(result.status, "failed");
    assert.equal("httpStatusClass" in result ? result.httpStatusClass : null, "4xx");
    assert.equal("providerErrorCode" in result ? result.providerErrorCode : null, "AccessDenied");
    assert.equal(
      "requestIdHash8" in result ? result.requestIdHash8 : null,
      hash8("request-id-for-hash")
    );
    assert.equal("objectKey" in result, false);
    assert.equal(capturedParams?.Bucket, "bucket-1234567890");
    assert.equal(capturedParams?.Region, "ap-hongkong");
    assert.equal(capturedParams?.Key, "asr-relay/test/private-key.mp3");
    assert.equal(capturedParams?.ContentLength, 5);
    assert.equal(capturedParams?.ContentType, "audio/mpeg");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("deletes a relay object with a signed DELETE request", async () => {
  let capturedParams:
    | {
        Bucket?: string;
        Region?: string;
        Key?: string;
      }
    | undefined;
  const result = await deleteRelayObject({
    objectKey: "/asr-relay/test/delete-success.mp3",
    storage: testStorageConfig(),
    cosClient: {
      putObject: async () => ({
        ETag: "\"test\"",
        Location: "bucket-1234567890.cos.ap-hongkong.myqcloud.com/test"
      }),
      deleteObject: async (params) => {
        capturedParams = params;
        return {};
      }
    }
  });

  assert.equal(result.status, "success");
  assert.equal(capturedParams?.Bucket, "bucket-1234567890");
  assert.equal(capturedParams?.Region, "ap-hongkong");
  assert.equal(capturedParams?.Key, "asr-relay/test/delete-success.mp3");
});

test("reports delete failures without exposing the object key", async () => {
  const rawObjectKey = "asr-relay/test/private-delete-key.mp3";
  const result = await deleteRelayObject({
    objectKey: rawObjectKey,
    storage: testStorageConfig(),
    cosClient: {
      putObject: async () => ({
        ETag: "\"test\"",
        Location: "bucket-1234567890.cos.ap-hongkong.myqcloud.com/test"
      }),
      deleteObject: async () => {
        throw { statusCode: 403, code: "AccessDenied" };
      }
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(
    "httpStatusClass" in result ? result.httpStatusClass : null,
    "4xx"
  );
  assert.doesNotMatch(JSON.stringify(result), new RegExp(rawObjectKey));
});

function relayTestConfig(
  tempRoot: string,
  overrides: Record<string, string> = {}
): MediaRelayConfig {
  return getMediaRelayConfig({
    MEDIA_RELAY_ENABLED: "1",
    MEDIA_RELAY_TMP_DIR: tempRoot,
    MEDIA_RELAY_DOWNLOAD_TIMEOUT_MS: "100",
    MEDIA_RELAY_FFMPEG_TIMEOUT_MS: "100",
    MEDIA_RELAY_MAX_INPUT_BYTES: "1024",
    MEDIA_RELAY_MAX_OUTPUT_BYTES: "1024",
    MEDIA_RELAY_MAX_DURATION_SECONDS: "1",
    MEDIA_RELAY_PUBLIC_BASE_URL: "https://media.example.test",
    COS_BUCKET: "bucket",
    COS_REGION: "ap-hongkong",
    COS_ENDPOINT: "cos.ap-hongkong.myqcloud.com",
    COS_ACCESS_KEY_ID: "test-access-key",
    COS_SECRET_ACCESS_KEY: "test-secret-key",
    ...overrides
  });
}

function testStorageConfig() {
  return {
    bucket: "bucket-1234567890",
    region: "ap-hongkong",
    endpoint: "cos.ap-hongkong.myqcloud.com",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    publicBaseUrl: "https://media.example.test"
  };
}

function hash8(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
