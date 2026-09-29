import assert from "node:assert/strict";
import test from "node:test";
import { transcribeAuthorizedMediaUrl } from "../../lib/asr/volcengine-asr-provider.ts";

const env = {
  VOLCENGINE_ASR_ENDPOINT: "https://asr.example.invalid/submit",
  VOLCENGINE_ASR_API_KEY: "test-only-secret",
  VOLCENGINE_ASR_RESOURCE_ID: "test-resource",
  VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS: "2",
  VOLCENGINE_ASR_QUERY_INTERVAL_MS: "1",
  VOLCENGINE_ASR_REQUEST_TIMEOUT_MS: "100"
};

function acceptedResponse() {
  return new Response("{}", {
    status: 200,
    headers: {
      "x-api-status-code": "20000000",
      "x-api-request-id": "test-request-id"
    }
  });
}

test("classifies a submit HTTP failure without exposing the response", async () => {
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env,
    fetchImpl: async () => new Response(null, { status: 503 })
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_SUBMIT_FAILED");
  assert.equal(
    "failureReason" in result ? result.failureReason : null,
    "submit_provider_unavailable"
  );
});

test("classifies a submit authentication failure separately from generic request failures", async () => {
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env,
    fetchImpl: async () => new Response(null, { status: 401 })
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_SUBMIT_FAILED");
  assert.equal(
    "failureReason" in result ? result.failureReason : null,
    "submit_auth_rejected"
  );
});

test("classifies an invalid submit endpoint before making a request", async () => {
  let called = false;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env: {
      ...env,
      VOLCENGINE_ASR_ENDPOINT: "not-a-valid-endpoint"
    },
    fetchImpl: async () => {
      called = true;
      return new Response(null, { status: 200 });
    }
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_SUBMIT_FAILED");
  assert.equal(
    "failureReason" in result ? result.failureReason : null,
    "submit_endpoint_invalid"
  );
  assert.equal(called, false);
});

test("classifies submit aborts as timeouts", async () => {
  const abortError = new Error("request aborted");
  abortError.name = "AbortError";
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env,
    fetchImpl: async () => {
      throw abortError;
    }
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_SUBMIT_FAILED");
  assert.equal("failureReason" in result ? result.failureReason : null, "submit_timeout");
});

test("classifies a query request failure separately from submit", async () => {
  let calls = 0;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return acceptedResponse();
      throw new Error("query unavailable");
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(
    "errorCode" in result ? result.errorCode : null,
    "ASR_QUERY_REQUEST_FAILED"
  );
});

test("classifies a query that remains processing at the polling boundary", async () => {
  let calls = 0;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return acceptedResponse();
      return new Response("{}", {
        status: 200,
        headers: { "x-api-status-code": "20000001" }
      });
    }
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_QUERY_TIMEOUT");
  assert.equal(calls, 3);
});

test("classifies a provider rejection from a query status code", async () => {
  let calls = 0;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return acceptedResponse();
      return new Response("{}", {
        status: 200,
        headers: { "x-api-status-code": "45000000" }
      });
    }
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_PROVIDER_REJECTED");
});

test("classifies a completed query without usable speech as no audio track", async () => {
  let calls = 0;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return acceptedResponse();
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { "x-api-status-code": "20000000" }
      });
    }
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_NO_AUDIO_TRACK");
});

test("classifies the provider silent-audio status as no audio track", async () => {
  let calls = 0;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return acceptedResponse();
      return new Response("{}", {
        status: 200,
        headers: { "x-api-status-code": "20000003" }
      });
    }
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_NO_AUDIO_TRACK");
});

test("uses an explicit media format when the authorized URL has no extension", async () => {
  let calls = 0;
  let submittedFormat: unknown;
  let submittedCodec: unknown;
  let submittedPunctuation: unknown;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://video.example.invalid/playback",
    mediaFormat: "mp4",
    env,
    fetchImpl: async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        const body = JSON.parse(String(init?.body));
        submittedFormat = body.audio.format;
        submittedCodec = body.audio.codec;
        submittedPunctuation = body.request.enable_punc;
        return acceptedResponse();
      }

      return new Response(
        JSON.stringify({ result: { text: "这是满足最小长度要求的测试口播文案" } }),
        {
          status: 200,
          headers: { "x-api-status-code": "20000000" }
        }
      );
    }
  });

  assert.equal(result.status, "success");
  assert.equal(submittedFormat, "mp4");
  assert.equal(submittedCodec, undefined);
  assert.equal(submittedPunctuation, true);
});

test("submits the relayed stable media URL when relay is enabled", async () => {
  let submittedUrl: unknown;
  let submittedFormat: unknown;
  let calls = 0;
  let deleteCalls = 0;
  const lifecycleEvents: string[] = [];
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://douyin-cdn.example.invalid/playback",
    mediaFormat: "mp4",
    env,
    mediaRelay: async () => ({
      status: "success" as const,
      url: "https://media.example.test/asr-relay/hash.mp3",
      format: "mp3" as const,
      diagnostic: {
        relayUsed: true as const,
        cleanupResult: "success" as const,
        objectKeyHash8: "12345678"
      },
      cleanupRemoteObject: async () => {
        deleteCalls += 1;
        lifecycleEvents.push("delete");
        return { status: "success" as const };
      }
    }),
    fetchImpl: async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        lifecycleEvents.push("submit");
        const body = JSON.parse(String(init?.body));
        submittedUrl = body.audio.url;
        submittedFormat = body.audio.format;
        return acceptedResponse();
      }

      lifecycleEvents.push("query_terminal");
      return new Response(
        JSON.stringify({ result: { text: "这是经过媒体中转后的测试口播文案" } }),
        {
          status: 200,
          headers: { "x-api-status-code": "20000000" }
        }
      );
    }
  });

  assert.equal(result.status, "success");
  assert.equal(submittedUrl, "https://media.example.test/asr-relay/hash.mp3");
  assert.equal(submittedFormat, "mp3");
  assert.equal(deleteCalls, 1);
  assert.deepEqual(lifecycleEvents, ["submit", "query_terminal", "delete"]);
  assert.equal(result.relayDiagnostic?.remoteDeleteAttempted, true);
  assert.equal(result.relayDiagnostic?.remoteDeleteResult, "deleted");
});

test("keeps ASR success when remote object deletion fails", async () => {
  let calls = 0;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://douyin-cdn.example.invalid/playback",
    mediaFormat: "mp4",
    env,
    mediaRelay: async () => ({
      status: "success" as const,
      url: "https://media.example.test/asr-relay/hash.mp3",
      format: "mp3" as const,
      diagnostic: {
        relayUsed: true as const,
        cleanupResult: "success" as const,
        objectKeyHash8: "87654321"
      },
      cleanupRemoteObject: async () => ({
        status: "failed" as const,
        reason: "object_delete_failed" as const,
        httpStatusClass: "5xx"
      })
    }),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return acceptedResponse();
      return new Response(
        JSON.stringify({ result: { text: "这是删除失败但转写仍成功的测试口播文案" } }),
        {
          status: 200,
          headers: { "x-api-status-code": "20000000" }
        }
      );
    }
  });

  assert.equal(result.status, "success");
  assert.equal(result.relayDiagnostic?.remoteDeleteAttempted, true);
  assert.equal(result.relayDiagnostic?.remoteDeleteResult, "delete_failed");
  assert.doesNotMatch(JSON.stringify(result), /private-delete-key/);
});

test("defers remote deletion when ASR query has not reached a terminal state", async () => {
  let calls = 0;
  let deleteCalls = 0;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://douyin-cdn.example.invalid/playback",
    mediaFormat: "mp4",
    env: {
      ...env,
      VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS: "2"
    },
    mediaRelay: async () => ({
      status: "success" as const,
      url: "https://media.example.test/asr-relay/hash.mp3",
      format: "mp3" as const,
      diagnostic: {
        relayUsed: true as const,
        cleanupResult: "success" as const,
        objectKeyHash8: "abcdef12"
      },
      cleanupRemoteObject: async () => {
        deleteCalls += 1;
        return { status: "success" as const };
      }
    }),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return acceptedResponse();
      return new Response("{}", {
        status: 200,
        headers: { "x-api-status-code": "20000001" }
      });
    }
  });

  assert.equal(result.status, "failed");
  assert.equal("errorCode" in result ? result.errorCode : null, "ASR_QUERY_TIMEOUT");
  assert.equal(deleteCalls, 0);
  assert.equal(result.relayDiagnostic?.remoteDeleteAttempted, false);
  assert.equal(
    result.relayDiagnostic?.remoteDeleteResult,
    "deferred_to_lifecycle"
  );
});

test("defers remote deletion when submit outcome is ambiguous", async () => {
  let deleteCalls = 0;
  const abortError = new Error("request aborted");
  abortError.name = "AbortError";
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://douyin-cdn.example.invalid/playback",
    mediaFormat: "mp4",
    env,
    mediaRelay: async () => ({
      status: "success" as const,
      url: "https://media.example.test/asr-relay/hash.mp3",
      format: "mp3" as const,
      diagnostic: {
        relayUsed: true as const,
        cleanupResult: "success" as const,
        objectKeyHash8: "fedcba98"
      },
      cleanupRemoteObject: async () => {
        deleteCalls += 1;
        return { status: "success" as const };
      }
    }),
    fetchImpl: async () => {
      throw abortError;
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(
    "failureReason" in result ? result.failureReason : null,
    "submit_timeout"
  );
  assert.equal(deleteCalls, 0);
  assert.equal(result.relayDiagnostic?.remoteDeleteAttempted, false);
  assert.equal(
    result.relayDiagnostic?.remoteDeleteResult,
    "deferred_to_lifecycle"
  );
});

test("fails safely when relay is enabled but storage config is missing", async () => {
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://douyin-cdn.example.invalid/playback",
    env: {
      ...env,
      MEDIA_RELAY_ENABLED: "1"
    },
    fetchImpl: async () => {
      throw new Error("ASR should not be called without relay config");
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(
    "errorCode" in result ? result.errorCode : null,
    "ASR_MEDIA_RELAY_NOT_CONFIGURED"
  );
  assert.deepEqual(
    "missingFields" in result ? result.missingFields : [],
    [
      "COS_BUCKET",
      "COS_REGION",
      "COS_ENDPOINT",
      "COS_ACCESS_KEY_ID",
      "COS_SECRET_ACCESS_KEY",
      "MEDIA_RELAY_PUBLIC_BASE_URL"
    ]
  );
});

test("keeps polling when the provider temporarily cannot find the query task", async () => {
  let calls = 0;
  const result = await transcribeAuthorizedMediaUrl({
    mediaUrl: "https://audio.example.invalid/source.mp3",
    env: {
      ...env,
      VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS: "3"
    },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return acceptedResponse();
      if (calls === 2) {
        return new Response("{}", {
          status: 200,
          headers: { "x-api-status-code": "45000006" }
        });
      }

      return new Response(
        JSON.stringify({ result: { text: "这是短暂查询失败后返回的测试口播文案" } }),
        {
          status: 200,
          headers: { "x-api-status-code": "20000000" }
        }
      );
    }
  });

  assert.equal(result.status, "success");
  assert.equal(calls, 3);
});
