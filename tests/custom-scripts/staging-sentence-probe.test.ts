import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { DeepSeekJsonResult } from "../../lib/ai/deepseek-runtime";
import {
  ProbeValidationError,
  assembleStagingProbeSentences,
  buildStagingSentenceProbeMessages,
  evaluateStagingSentenceProbeContent,
  runStagingSentenceProbeSeries,
  type StagingSentenceProbeProvider
} from "../../lib/custom-scripts/staging-sentence-probe";

const validationContext = {
  objective: "trust" as const,
  requestText: "写一条适合附近上班族的下午茶口播",
  merchantProjectName: "小岛西点烘焙",
  merchantProfileText: "主营甜品和下午茶，服务附近上班族。"
};

function sentencesForTotal(total: number) {
  const contentTotal = total - 24;
  const base = Math.floor(contentTotal / 24);
  let remainder = contentTotal % 24;
  return Array.from({ length: 24 }, (_, index) => {
    const contentLength = base + (remainder-- > 0 ? 1 : 0);
    return `${String.fromCodePoint(0x4e00 + index)}${"真".repeat(contentLength - 1)}。`;
  });
}

function providerSuccess(sentences = sentencesForTotal(288)): DeepSeekJsonResult {
  return {
    status: "success",
    content: JSON.stringify({ status: "success", sentences }),
    diagnostic: {
      attempts: 1,
      finishReason: "stop",
      responseLengthBucket: "1-999",
      promptTokensBucket: "1000-4999",
      completionTokensBucket: "1-999",
      promptCacheHitTokensBucket: "1-999",
      promptCacheMissTokensBucket: "1000-4999",
      thinkingMode: "disabled"
    }
  };
}

test("rejects 23, 25, non-string, empty, multi-sentence, missing punctuation and overlong sentence arrays", () => {
  const valid = sentencesForTotal(288);
  const nonString: unknown[] = [...valid];
  nonString[0] = 42;
  const cases: Array<{ value: unknown; reason: string }> = [
    { value: valid.slice(0, 23), reason: "sentence_count" },
    { value: [...valid, "额外一句。"], reason: "sentence_count" },
    { value: nonString, reason: "sentence_value" },
    { value: valid.with(0, ""), reason: "sentence_value" },
    { value: valid.with(0, "OnlyEnglish。"), reason: "sentence_value" },
    { value: valid.with(0, "一句。又一句。"), reason: "sentence_format" },
    { value: valid.with(0, "一句\n又一句。"), reason: "sentence_format" },
    { value: valid.with(0, "没有标点"), reason: "sentence_format" },
    { value: valid.with(0, `${"长".repeat(26)}。`), reason: "sentence_length" },
    { value: valid.with(0, "1.这是编号。"), reason: "list_or_heading" },
    { value: valid.with(0, "#这是标题。"), reason: "list_or_heading" }
  ];

  for (const item of cases) {
    assert.throws(
      () => assembleStagingProbeSentences(item.value),
      (error) => error instanceof ProbeValidationError && error.reason === item.reason
    );
  }
});

test("preserves sentence order and joins with exactly one newline without mutation", () => {
  const sentences = sentencesForTotal(288).map((sentence, index) =>
    index === 0 ? `开头${sentence}` : sentence
  );
  assert.equal(assembleStagingProbeSentences(sentences), sentences.join("\n"));
});

test("reuses finalScript boundaries and safety validation after assembly", () => {
  for (const total of [279, 280, 300, 301]) {
    const metrics = evaluateStagingSentenceProbeContent(
      JSON.stringify({ status: "success", sentences: sentencesForTotal(total) }),
      validationContext
    );
    assert.equal(metrics.status, total === 280 || total === 300 ? "passed" : "failed");
    assert.equal(metrics.validationReason, total === 280 || total === 300 ? "none" : "length");
  }

  const unsafeCases = [
    { sentence: "今天套餐只要30元。", reason: "fact_safety" },
    { sentence: "家人们谁懂啊真好。", reason: "forbidden_expression" },
    { sentence: "欢迎大家到店看看。", reason: "cta" }
  ];
  for (const item of unsafeCases) {
    const metrics = evaluateStagingSentenceProbeContent(
      JSON.stringify({ status: "success", sentences: sentencesForTotal(288).with(0, item.sentence) }),
      validationContext
    );
    assert.equal(metrics.status, "failed");
    assert.equal(metrics.validationReason, item.reason);
  }
});

test("accepts needs_profile only through the existing missing-facts contract", () => {
  const accepted = evaluateStagingSentenceProbeContent(
    JSON.stringify({ status: "needs_profile", missingFacts: ["main_product"] }),
    validationContext
  );
  assert.equal(accepted.status, "needs_profile");
  assert.equal(accepted.validationReason, "needs_profile");

  const rejected = evaluateStagingSentenceProbeContent(
    JSON.stringify({ status: "needs_profile", missingFacts: ["unknown"] }),
    validationContext
  );
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.validationReason, "missing_facts_value");
});

test("uses the isolated 24-sentence prompt and one fixed provider call", async () => {
  const messages = buildStagingSentenceProbeMessages({ merchantProfileText: "PROFILE_MARKER" });
  assert.deepEqual(messages.map(({ role }) => role), ["system", "user", "system", "user"]);
  assert.match(messages[0].content, /sentences/u);
  assert.match(messages[1].content, /PROFILE_MARKER/u);
  assert.match(messages[2].content, /24/u);
  assert.doesNotMatch(messages[3].content, /PROFILE_MARKER/u);

  let captured: Parameters<StagingSentenceProbeProvider>[0] | undefined;
  const result = await runStagingSentenceProbeSeries({
    env: { CUSTOM_SCRIPT_SENTENCE_PROBE: "STAGING", STAGING_ENABLE_REAL_PROVIDERS: "1", NODE_ENV: "production" },
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "PROFILE_MARKER",
    provider: async (request) => {
      captured = request;
      return providerSuccess();
    },
    writeLine: () => undefined
  });

  assert.equal(result.gate, true);
  assert.equal(result.runsCompleted, 5);
  assert.equal(captured?.maxAttempts, 1);
  assert.equal(captured?.allowEnvelopeRetry, false);
  assert.equal(captured?.thinkingMode, "disabled");
  assert.equal(captured?.maxTokens, 1_600);
  assert.equal(captured?.temperature, 0.75);
  assert.equal("usageUserId" in (captured ?? {}), false);
});

test("requires both staging switches before database or provider access", async () => {
  for (const env of [
    {},
    { CUSTOM_SCRIPT_SENTENCE_PROBE: "staging", STAGING_ENABLE_REAL_PROVIDERS: "1" },
    { CUSTOM_SCRIPT_SENTENCE_PROBE: "STAGING" },
    { STAGING_ENABLE_REAL_PROVIDERS: "1" }
  ]) {
    let loads = 0;
    let calls = 0;
    await assert.rejects(
      runStagingSentenceProbeSeries({
        env,
        runtimeModel: "deepseek-v4-flash",
        merchantProjectName: "小岛西点烘焙",
        loadProfile: async () => { loads += 1; return "PROFILE"; },
        provider: async () => { calls += 1; return providerSuccess(); },
        writeLine: () => undefined
      }),
      ProbeValidationError
    );
    assert.equal(loads, 0);
    assert.equal(calls, 0);
  }
});

test("allows production-built staging only with both staging switches and rejects the wrong model", async () => {
  const allowed = await runStagingSentenceProbeSeries({
    env: {
      CUSTOM_SCRIPT_SENTENCE_PROBE: "STAGING",
      STAGING_ENABLE_REAL_PROVIDERS: "1",
      NODE_ENV: "production"
    },
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "主营甜品和下午茶。",
    provider: async () => providerSuccess(),
    writeLine: () => undefined
  });
  assert.equal(allowed.gate, true);

  let loads = 0;
  let calls = 0;
  await assert.rejects(
    runStagingSentenceProbeSeries({
      env: { CUSTOM_SCRIPT_SENTENCE_PROBE: "STAGING", STAGING_ENABLE_REAL_PROVIDERS: "1" },
      runtimeModel: "deepseek-chat",
      merchantProjectName: "小岛西点烘焙",
      loadProfile: async () => { loads += 1; return "PROFILE"; },
      provider: async () => { calls += 1; return providerSuccess(); },
      writeLine: () => undefined
    }),
    (error) => error instanceof ProbeValidationError && error.reason === "model_mismatch"
  );
  assert.equal(loads, 0);
  assert.equal(calls, 0);
});

test("stops at the first failure and emits only sanitized metrics", async () => {
  const secretMarkers = [
    "PROFILE_SECRET", "REQUEST_SECRET", "SENTENCE_SECRET", "database-id", "api-secret", "测试-1", "小岛西点烘焙"
  ];
  let calls = 0;
  const lines: string[] = [];
  const result = await runStagingSentenceProbeSeries({
    env: { CUSTOM_SCRIPT_SENTENCE_PROBE: "STAGING", STAGING_ENABLE_REAL_PROVIDERS: "1", NODE_ENV: "production" },
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "PROFILE_SECRET database-id",
    provider: async () => {
      calls += 1;
      return providerSuccess(sentencesForTotal(288).slice(0, 23).with(0, "SENTENCE_SECRET。"));
    },
    writeLine: (line) => lines.push(line)
  });

  assert.equal(result.gate, false);
  assert.equal(result.runsCompleted, 1);
  assert.equal(calls, 1);
  const output = lines.join("");
  for (const marker of secretMarkers) assert.doesNotMatch(output, new RegExp(marker, "u"));
  const run = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.deepEqual(Object.keys(run).sort(), [
    "assembledLengthBucket", "completionTokensBucket", "durationMs", "exact24", "finishReason", "parseError",
    "jsonParsed", "promptCacheHitTokensBucket", "promptCacheMissTokensBucket", "promptTokensBucket",
    "punctuationOk", "responseLengthBucket", "runIndex", "sentenceMaxWithin25", "status", "validationReason"
  ].sort());
  assert.equal(typeof run.assembledLengthBucket, "string");
  assert.equal(run.responseLengthBucket, "1-999");
  assert.equal(run.parseError, "none");
  assert.equal("sentences" in run, false);
  assert.equal("finalScript" in run, false);
});

test("probe source has no business database write path", () => {
  const moduleSource = readFileSync(join(process.cwd(), "lib/custom-scripts/staging-sentence-probe.ts"), "utf8");
  const scriptSource = readFileSync(join(process.cwd(), "scripts/staging-custom-script-sentence-probe.ts"), "utf8");
  const combined = `${moduleSource}\n${scriptSource}`;
  assert.doesNotMatch(combined, /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/u);
  assert.doesNotMatch(combined, /\$transaction\s*\(/u);
  assert.doesNotMatch(combined, /usageUserId\s*:/u);
  assert.match(scriptSource, /select:\s*\{\s*profileText:\s*true\s*\}/u);
  assert.match(
    readFileSync(join(process.cwd(), "Dockerfile"), "utf8"),
    /scripts\/staging-custom-script-sentence-probe\.ts/u
  );
});
