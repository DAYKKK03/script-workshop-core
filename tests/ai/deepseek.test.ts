import assert from "node:assert/strict";
import test from "node:test";
import { requestDeepSeekJson } from "../../lib/ai/deepseek.ts";

const originalFetch = globalThis.fetch;

function setDeepSeekTestEnv() {
  process.env.DEEPSEEK_API_KEY = "test-only-deepseek-key";
  process.env.DEEPSEEK_API_BASE_URL = "https://deepseek.example.test/v1";
  process.env.DEEPSEEK_MODEL = "test-model";
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

async function requestWithMock(fetchImpl: typeof fetch, options: { maxAttempts?: number; allowEnvelopeRetry?: boolean } = {}) {
  setDeepSeekTestEnv();
  globalThis.fetch = fetchImpl;

  try {
    return await requestDeepSeekJson({
      messages: [{ role: "user", content: "test prompt" }],
      temperature: 0,
      ...options
    });
  } finally {
    restoreFetch();
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_BASE_URL;
    delete process.env.DEEPSEEK_MODEL;
  }
}

test("classifies DeepSeek HTTP failures without exposing the response", async () => {
  let calls = 0;
  const result = await requestWithMock(
    (async () => {
      calls += 1;
      return new Response("provider-body-secret", { status: 401 });
    }) as typeof fetch
  );

  assert.equal(result.status, "failed");
  assert.equal("diagnostic" in result ? result.diagnostic.providerSubreason : null, "http_4xx");
  assert.equal("diagnostic" in result ? result.diagnostic.httpStatusClass : null, "4xx");
  assert.equal("diagnostic" in result ? result.diagnostic.attempts : null, 1);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /provider-body-secret|test-only-deepseek-key|test prompt/);
});

test("retries DeepSeek 429 and 5xx failures with bounded backoff", async () => {
  let calls = 0;
  const transientStatuses = [429, 503];
  const result = await requestWithMock(
    (async () => {
      calls += 1;

      if (calls <= transientStatuses.length) {
        return new Response("provider-body-secret", {
          status: transientStatuses[calls - 1]
        });
      }

      return new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200 }
      );
    }) as typeof fetch
  );

  assert.equal(result.status, "success");
  assert.equal(calls, 3);
});

test("classifies empty DeepSeek content after bounded retries", async () => {
  let calls = 0;
  const result = await requestWithMock(
    (async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200
      });
    }) as typeof fetch
  );

  assert.equal(result.status, "failed");
  assert.equal("diagnostic" in result ? result.diagnostic.providerSubreason : null, "empty_content");
  assert.equal("diagnostic" in result ? result.diagnostic.attempts : null, 3);
  assert.equal(calls, 3);
});

test("records bucketed usage and response lengths without response bodies", async () => {
  const result = await requestWithMock(
    (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }],
      usage: {
        prompt_tokens: 1234,
        completion_tokens: 56,
        prompt_cache_hit_tokens: 900,
        prompt_cache_miss_tokens: 334
      }
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.diagnostic.promptTokensBucket, "1000-4999");
    assert.equal(result.diagnostic.completionTokensBucket, "1-999");
    assert.equal(result.diagnostic.promptCacheHitTokensBucket, "1-999");
    assert.equal(result.diagnostic.promptCacheMissTokensBucket, "1-999");
    assert.equal(result.diagnostic.reasoningCharLengthBucket, "0");
    assert.equal(result.diagnostic.contentCharLengthBucket, "1-999");
    assert.equal(result.diagnostic.thinkingMode, "omitted");
  }
  assert.doesNotMatch(JSON.stringify(result), /test prompt|internal reasoning|test-only-deepseek-key/);
});

test("records finish_reason length and empty content diagnostics", async () => {
  const result = await requestWithMock(
    (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: "" } }],
      usage: { prompt_tokens: 200, completion_tokens: 2500 }
    }), { status: 200 })) as typeof fetch,
    { maxAttempts: 1 }
  );
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.diagnostic.providerSubreason, "empty_content");
    assert.equal(result.diagnostic.finishReason, "length");
    assert.equal(result.diagnostic.promptTokensBucket, "1-999");
    assert.equal(result.diagnostic.completionTokensBucket, "1000-4999");
    assert.equal(result.diagnostic.reasoningCharLengthBucket, "0");
    assert.equal(result.diagnostic.contentCharLengthBucket, "0");
    assert.equal(result.diagnostic.thinkingMode, "omitted");
  }
});

test("records reasoning length when provider omits visible content", async () => {
  const result = await requestWithMock(
    (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { reasoning_content: "internal reasoning" } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 }
    }), { status: 200 })) as typeof fetch,
    { maxAttempts: 1 }
  );
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.diagnostic.reasoningCharLengthBucket, "1-999");
    assert.equal(result.diagnostic.contentCharLengthBucket, "0");
    assert.equal(result.diagnostic.thinkingMode, "omitted");
  }
});

test("marks missing usage as missing_or_zero", async () => {
  const result = await requestWithMock(
    (async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 })) as typeof fetch
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.diagnostic.promptTokensBucket, "missing_or_zero");
    assert.equal(result.diagnostic.completionTokensBucket, "missing_or_zero");
    assert.equal(result.diagnostic.promptCacheHitTokensBucket, "missing_or_zero");
    assert.equal(result.diagnostic.promptCacheMissTokensBucket, "missing_or_zero");
  }
});

test("classifies invalid provider JSON separately", async () => {
  let calls = 0;
  const result = await requestWithMock(
    (async () => {
      calls += 1;
      return new Response("not-json", { status: 200 });
    }) as typeof fetch
  );

  assert.equal(result.status, "failed");
  assert.equal("diagnostic" in result ? result.diagnostic.providerSubreason : null, "provider_envelope_invalid_json");
  assert.equal("diagnostic" in result ? result.diagnostic.responseLengthBucket : null, "1-999");
  assert.equal("diagnostic" in result ? result.diagnostic.parseError : null, "json_syntax");
  assert.equal("diagnostic" in result ? result.diagnostic.requestPromptLengthBucket : null, "0-1999");
  assert.equal("diagnostic" in result ? result.diagnostic.responseContentTypeClass : null, "text");
  assert.equal("diagnostic" in result ? result.diagnostic.responseDeclaredLengthBucket : null, "missing");
  assert.equal("diagnostic" in result ? result.diagnostic.responseTransferClass : null, "unknown");
  assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(result), /not-json|test-only-deepseek-key|test prompt/);
  assert.equal("promptTokensBucket" in result.diagnostic, false);
  assert.equal("reasoningCharLengthBucket" in result.diagnostic, false);
});

test("classifies HTML and empty 2xx provider envelopes without semantic retry", async () => {
  for (const [body, parseError, expectedBucket] of [["<!doctype html><title>gateway</title>", "html_body", "1-999"], ["", "empty_content", "0"]] as const) {
    let calls = 0;
    const result = await requestWithMock((async () => {
      calls += 1;
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch);
    assert.equal(result.status, "failed");
    assert.equal("diagnostic" in result ? result.diagnostic.providerSubreason : null, "provider_envelope_invalid_json");
    assert.equal("diagnostic" in result ? result.diagnostic.parseError : null, parseError);
    assert.equal("diagnostic" in result ? result.diagnostic.responseLengthBucket : null, expectedBucket);
    assert.equal(calls, 2);
  }
});

test("retries one empty provider envelope and succeeds without semantic retry", async () => {
  let calls = 0;
  const requestBodies: string[] = [];
  const requestHeaders: string[] = [];
  const result = await requestWithMock((async (_url, init) => {
    calls += 1;
    requestBodies.push(String(init?.body));
    requestHeaders.push(new Headers(init?.headers).get("connection") || "default");
    return calls === 1
      ? new Response("", { status: 200 })
      : new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  }) as typeof fetch, { maxAttempts: 1 });
  assert.equal(result.status, "success");
  assert.equal(calls, 2);
  assert.equal(requestBodies[0], requestBodies[1]);
  assert.deepEqual(requestHeaders, ["default", "close"]);
  assert.equal(result.diagnostic.transportAttempts?.[1]?.connectionMode, "close");
});

test("returns the envelope classification after the single retry also fails", async () => {
  let calls = 0;
  const result = await requestWithMock((async () => {
    calls += 1;
    return new Response("", { status: 200 });
  }) as typeof fetch, { maxAttempts: 1 });
  assert.equal(result.status, "failed");
  assert.equal("diagnostic" in result ? result.diagnostic.providerSubreason : null, "provider_envelope_invalid_json");
  assert.equal("diagnostic" in result ? result.diagnostic.attempts : null, 2);
  assert.equal("diagnostic" in result ? result.diagnostic.parseError : null, "empty_content");
  assert.equal(calls, 2);
  assert.equal(result.diagnostic.transportAttempts?.[0]?.connectionMode, "default");
  assert.equal(result.diagnostic.transportAttempts?.[1]?.connectionMode, "close");
});

test("allows custom-script callers to disable the hidden envelope retry", async () => {
  let calls = 0;
  const result = await requestWithMock((async () => {
    calls += 1;
    return new Response("", { status: 200 });
  }) as typeof fetch, { maxAttempts: 1, allowEnvelopeRetry: false });
  assert.equal(result.status, "failed");
  assert.equal(result.diagnostic.providerSubreason, "provider_envelope_invalid_json");
  assert.equal(result.diagnostic.attempts, 1);
  assert.equal(calls, 1);
});

test("normalizes fenced provider JSON before domain validation", async () => {
  const result = await requestWithMock(
    (async () => new Response(JSON.stringify({ choices: [{ message: { content: "```json\n{\"ideas\":[]}\n```" } }] }), { status: 200 })) as typeof fetch
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.content, '{"ideas":[]}');
    assert.equal(result.diagnostic.attempts, 1);
    assert.equal(result.diagnostic.responseLengthBucket, "1-999");
  }
});

test("passes a bounded completion budget for large JSON responses", async () => {
  setDeepSeekTestEnv();
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await requestDeepSeekJson({ messages: [{ role: "user", content: "test prompt" }], temperature: 0, maxTokens: 20_000 });
    assert.equal(result.status, "success");
    assert.equal(requestBody.max_tokens, 8192);
  } finally {
    restoreFetch();
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_BASE_URL;
    delete process.env.DEEPSEEK_MODEL;
  }
});

test("sends only the explicit disabled thinking parameter when requested", async () => {
  setDeepSeekTestEnv();
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await requestDeepSeekJson({ messages: [{ role: "user", content: "test prompt" }], temperature: 0, maxTokens: 2500 });
    const result = await requestDeepSeekJson({ messages: [{ role: "user", content: "test prompt" }], temperature: 0, maxTokens: 2500, thinkingMode: "disabled" });
    assert.equal(result.status, "success");
    assert.equal(bodies.length, 2);
    const disabledBodyWithoutThinking = { ...bodies[1] };
    delete disabledBodyWithoutThinking.thinking;
    assert.deepEqual(disabledBodyWithoutThinking, bodies[0]);
    assert.deepEqual(bodies[1].thinking, { type: "disabled" });
    assert.equal(result.diagnostic.thinkingMode, "disabled");
  } finally {
    restoreFetch();
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_BASE_URL;
    delete process.env.DEEPSEEK_MODEL;
  }
});

test("classifies truncated JSON without returning partial content", async () => {
  const result = await requestWithMock(
    (async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"ideas":[{"title":"unfinished"}' } }] }), { status: 200 })) as typeof fetch
  );
  assert.equal(result.status, "failed");
  assert.equal("diagnostic" in result ? result.diagnostic.providerSubreason : null, "model_content_invalid_json");
  assert.equal("diagnostic" in result ? result.diagnostic.finishReason : null, "length");
  assert.equal("diagnostic" in result ? result.diagnostic.parseError : null, "truncated_json");
  assert.equal("diagnostic" in result ? result.diagnostic.responseLengthBucket : null, "1-999");
});

test("retries timeout and network errors before returning a sanitized failure", async () => {
  let timeoutCalls = 0;
  const timeout = await requestWithMock(
    (async () => {
      timeoutCalls += 1;
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as typeof fetch
  );
  let networkCalls = 0;
  const network = await requestWithMock(
    (async () => {
      networkCalls += 1;
      throw new Error("network failure");
    }) as typeof fetch
  );

  assert.equal(timeout.status === "failed" ? timeout.diagnostic.providerSubreason : null, "timeout");
  assert.equal(timeout.diagnostic.attempts, 3);
  assert.equal(timeoutCalls, 3);
  assert.equal(network.status === "failed" ? network.diagnostic.providerSubreason : null, "network_error");
  assert.equal(network.diagnostic.attempts, 3);
  assert.equal(networkCalls, 3);
});
