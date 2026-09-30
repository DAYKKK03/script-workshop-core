import assert from "node:assert/strict";
import test from "node:test";
import { analyzeReferenceScript } from "../../lib/scripts/analyze-reference-script.ts";

const usableTranscript =
  "今天来店里先看刚出炉的蛋挞，黄油香味一下就出来了。现在两盒活动还送饮品，路过的顾客基本都会停下来问一嘴。";
const originalFetch = globalThis.fetch;

async function withCapturedErrors<T>(callback: () => Promise<T>) {
  const lines: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => lines.push(args.join(" "));

  try {
    return { result: await callback(), lines };
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_BASE_URL;
    delete process.env.DEEPSEEK_MODEL;
  }
}

function setDeepSeekTestEnv() {
  process.env.DEEPSEEK_API_KEY = "test-only-deepseek-key";
  process.env.DEEPSEEK_API_BASE_URL = "https://deepseek.example.test/v1";
  process.env.DEEPSEEK_MODEL = "test-model";
}

test("logs a sanitized DeepSeek HTTP subtype for analyze failures", async () => {
  setDeepSeekTestEnv();
  globalThis.fetch = (async () =>
    new Response("provider-body-secret", { status: 500 })) as typeof fetch;

  const captured = await withCapturedErrors(() =>
    analyzeReferenceScript(usableTranscript, "user-secret-id")
  );
  const event = JSON.parse(captured.lines.at(-1) || "{}");

  assert.equal(captured.result.status, "failed");
  assert.equal(event.event, "analyze_reference_failed");
  assert.equal(event.errorCode, "AI_PROVIDER_FAILED");
  assert.equal(event.providerSubreason, "http_5xx");
  assert.equal(event.model, "test-model");
  assert.equal(event.baseHostPath, "deepseek.example.test/v1");
  assert.match(event.transcriptLengthBucket, /^(40-99|100-499|500-1999|2000\+)$/);
  assert.doesNotMatch(captured.lines.join("\n"), /provider-body-secret|user-secret-id|test-only-deepseek-key|原口播文案/);
});

test("logs schema validation failures with sections count only", async () => {
  setDeepSeekTestEnv();
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ sections: [] }) } }] }),
      { status: 200 }
    )) as typeof fetch;

  const captured = await withCapturedErrors(() =>
    analyzeReferenceScript(usableTranscript)
  );
  const event = JSON.parse(captured.lines.at(-1) || "{}");

  assert.equal(captured.result.status, "failed");
  assert.equal(event.errorCode, "INVALID_REFERENCE_STRUCTURE");
  assert.equal(event.providerSubreason, "schema_invalid");
  assert.equal(event.sectionsCount, 0);
  assert.equal("transcript" in event, false);
});

test("logs transcript gate failures without transcript content", async () => {
  const captured = await withCapturedErrors(() =>
    analyzeReferenceScript("short private transcript", "user-secret-id")
  );
  const event = JSON.parse(captured.lines.at(-1) || "{}");

  assert.equal(captured.result.status, "failed");
  assert.equal(event.errorCode, "REFERENCE_TRANSCRIPT_TOO_SHORT");
  assert.equal(event.providerSubreason, "transcript_too_short");
  assert.equal(event.transcriptLengthBucket, "1-39");
  assert.doesNotMatch(captured.lines.join("\n"), /short private transcript|user-secret-id/);
});
