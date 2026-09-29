import assert from "node:assert/strict";
import test from "node:test";
import { requestTikHubWithRetry } from "../../lib/douyin/tikhub-request.ts";

test("retries a provider server error once and returns the successful response", async () => {
  const responses = [
    new Response(null, { status: 500 }),
    new Response("{}", { status: 200 })
  ];
  let attempts = 0;

  const result = await requestTikHubWithRetry({
    request: async () => {
      attempts += 1;
      return responses.shift()!;
    },
    retryDelayMs: 0
  });

  assert.equal(result.status, "success");
  assert.equal(attempts, 2);
});

test("does not retry an authentication failure", async () => {
  let attempts = 0;

  const result = await requestTikHubWithRetry({
    request: async () => {
      attempts += 1;
      return new Response(null, { status: 401 });
    },
    retryDelayMs: 0
  });

  assert.deepEqual(result, {
    status: "failed",
    errorCode: "TIKHUB_PROVIDER_AUTH_FAILED",
    attempts: 1,
    retryable: false,
    httpStatus: 401,
    failureCategory: "auth",
    responseBodyLength: 0,
    responseBodyHash8: "e3b0c442"
  });
  assert.equal(attempts, 1);
});

test("stops after one retry when rate limiting persists", async () => {
  let attempts = 0;

  const result = await requestTikHubWithRetry({
    request: async () => {
      attempts += 1;
      return new Response(null, { status: 429 });
    },
    retryDelayMs: 0
  });

  assert.deepEqual(result, {
    status: "failed",
    errorCode: "TIKHUB_PROVIDER_TRANSIENT_FAILED",
    attempts: 2,
    retryable: true,
    httpStatus: 429,
    failureCategory: "transient",
    responseBodyLength: 0,
    responseBodyHash8: "e3b0c442"
  });
  assert.equal(attempts, 2);
});

test("retries a thrown network error once", async () => {
  let attempts = 0;

  const result = await requestTikHubWithRetry({
    request: async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("network unavailable");
      }

      return new Response("{}", { status: 200 });
    },
    retryDelayMs: 0
  });

  assert.equal(result.status, "success");
  assert.equal(attempts, 2);
});

test("captures a sanitized response summary for non-auth request failures", async () => {
  const result = await requestTikHubWithRetry({
    request: async () =>
      new Response('{"error":"share url unsupported"}', { status: 422 }),
    retryDelayMs: 0
  });

  assert.deepEqual(result, {
    status: "failed",
    errorCode: "TIKHUB_PROVIDER_REQUEST_FAILED",
    attempts: 1,
    retryable: false,
    httpStatus: 422,
    failureCategory: "request",
    responseBodyLength: 33,
    responseBodyHash8: "56f5f8b7"
  });
});
