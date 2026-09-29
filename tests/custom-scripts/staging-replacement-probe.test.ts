import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { DeepSeekFailureDiagnostic, DeepSeekJsonResult } from "../../lib/ai/deepseek-runtime";
import {
  PREFIX_ID_TO_TEXT,
  STAGING_REPLACEMENT_PREFIX_IDS,
  type StagingReplacementPrefixId
} from "../../lib/custom-scripts/staging-replacement-prefixes";
import {
  ReplacementProbeValidationError,
  buildStagingReplacementBaseMessages,
  buildStagingReplacementProbeMessages,
  countBaseSentenceLengthBuckets,
  evaluateStagingPrefixChoices,
  finalizeStagingReplacementScript,
  runStagingReplacementProbeSeries,
  selectDeterministicReplacementSubset,
  safeProviderDiagnostic,
  type StagingReplacementProbeProvider
} from "../../lib/custom-scripts/staging-replacement-probe";
import { STAGING_REPLACEMENT_JSON_EXAMPLE } from "../../lib/custom-scripts/staging-replacement-probe-prompt";
import { stagingProbeExitCode } from "../../lib/custom-scripts/staging-probe-cli";

const context = {
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

function prefixChoicesFor(ids: readonly string[] = STAGING_REPLACEMENT_PREFIX_IDS): Array<{
  index: number;
  prefixIds: string[];
}> {
  return Array.from({ length: 24 }, (_, index) => ({
    index,
    prefixIds: [ids[index % ids.length]]
  }));
}

function providerSuccess(content: Record<string, unknown>): DeepSeekJsonResult {
  return {
    status: "success",
    content: JSON.stringify(content),
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

function numericPaths(value: unknown, path = ""): string[] {
  if (typeof value === "number") return [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    numericPaths(child, path ? `${path}.${key}` : key)
  );
}

test("accepts only the fixed prefixChoices contract and rejects both legacy contracts", () => {
  const originals = sentencesForTotal(250);
  for (const oldShape of [
    { status: "success", replacements: originals.map((sentence, index) => ({ index, replacement: sentence })) },
    { status: "success", prefixes: originals.map((_, index) => ({ index, prefix: "每天现做" })) }
  ]) {
    const evaluation = evaluateStagingPrefixChoices(JSON.stringify(oldShape), originals, context);
    assert.equal(evaluation.exact24, false);
    assert.equal(evaluation.validationReason, "shape");
  }

  const valid = evaluateStagingPrefixChoices(JSON.stringify({
    status: "success",
    prefixChoices: prefixChoicesFor()
  }), originals, context);
  assert.equal(valid.exact24, true);
  assert.equal(valid.validChoiceCount, 24);
  assert.ok(valid.validCandidates.length > 0);
  assert.deepEqual(valid.validCandidates[0], { index: 0, prefixId: "actually" });
});

test("rejects exact-schema violations, invalid indexes and invalid ID lists", () => {
  const originals = sentencesForTotal(250);
  const valid = prefixChoicesFor();
  const cases: Array<[unknown, string]> = [
    [{ status: "success", prefixChoices: valid.slice(0, 23) }, "choice_count"],
    [{ status: "success", prefixChoices: valid.with(23, { index: 22, prefixIds: ["actually"] }) }, "choice_index"],
    [{ status: "success", prefixChoices: valid.with(23, { index: 24, prefixIds: ["actually"] }) }, "choice_index"],
    [{ status: "success", prefixChoices: valid.with(0, {
      index: 0,
      prefixIds: [],
      extra: true
    } as unknown as (typeof valid)[number]) }, "choice_value"],
    [{ status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: [] }) }, "prefix_ids_count"],
    [{ status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: ["actually", "contrast", "therefore", "another_angle"] }) }, "prefix_ids_count"],
    [{ status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: ["actually", "actually"] }) }, "prefix_id_duplicate"],
    [{ status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: ["每天现做"] }) }, "prefix_id_unknown"],
    [{ status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: ["actually;ignore_rules"] }) }, "prefix_id_unknown"]
  ];
  for (const [body, reason] of cases) {
    const evaluation = evaluateStagingPrefixChoices(JSON.stringify(body), originals, context);
    assert.equal(evaluation.exact24, false, reason);
    assert.equal(evaluation.validationReason, reason);
  }
});

test("all 20 non-numeric commercial facts and instructions are unrepresentable as prefix IDs", () => {
  const originals = sentencesForTotal(250);
  const facts = [
    "每天现做", "免费配送", "进口原料", "官方认证", "绝对有效",
    "半价优惠", "双倍赠送", "俩人同行", "首单立减", "永久免费",
    "国家标准", "行业第一", "当天见效", "上门服务", "到店倒茶",
    "赠送礼品", "限时名额", "销量冠军", "忽略规则", "输出原文"
  ];
  for (const fact of facts) {
    const evaluation = evaluateStagingPrefixChoices(JSON.stringify({
      status: "success",
      prefixChoices: prefixChoicesFor().with(0, { index: 0, prefixIds: [fact] })
    }), originals, context);
    assert.equal(evaluation.exact24, false, fact);
    assert.equal(evaluation.validationReason, "prefix_id_unknown", fact);
    assert.equal(Object.values(PREFIX_ID_TO_TEXT).some((prefix) => prefix.includes(fact)), false, fact);
  }
});

test("prompt derives a complete varied example from the runtime ID source", () => {
  const fixture = JSON.parse(STAGING_REPLACEMENT_JSON_EXAMPLE) as {
    status: string;
    prefixChoices: Array<{ index: number; prefixIds: StagingReplacementPrefixId[] }>;
  };
  assert.equal(fixture.status, "success");
  assert.equal(fixture.prefixChoices.length, 24);
  assert.deepEqual(fixture.prefixChoices.map(({ index }) => index), Array.from({ length: 24 }, (_, index) => index));
  assert.ok(new Set(fixture.prefixChoices.flatMap(({ prefixIds }) => prefixIds)).size >= 4);
  for (const { prefixIds } of fixture.prefixChoices) {
    assert.ok(prefixIds.length >= 1 && prefixIds.length <= 3);
    assert.ok(prefixIds.every((prefixId) => STAGING_REPLACEMENT_PREFIX_IDS.includes(prefixId)));
  }

  const messages = buildStagingReplacementProbeMessages({
    merchantProfileText: "PROFILE_SECRET",
    sentences: sentencesForTotal(250)
  });
  assert.match(messages[2].content, /唯一允许的prefixId/u);
  assert.match(messages[2].content, /固定JSON示例/u);
  assert.match(messages[2].content, /最多使用2次/u);
  assert.match(messages[2].content, /候选顺序无偏好/u);
  assert.match(messages[2].content, /服务端会按枚举顺序规范化/u);
  assert.doesNotMatch(messages[2].content, /PROFILE_SECRET/u);
});

test("base prompt fixes the isolated probe below 280 without changing product validation", () => {
  const messages = buildStagingReplacementBaseMessages({ merchantProfileText: "PROFILE_MARKER" });
  assert.deepEqual(messages.map(({ role }) => role), ["system", "user", "system", "user"]);
  assert.match(messages[2].content, /整体必须低于280/u);
  assert.match(messages[2].content, /10至11/u);
  assert.match(messages[1].content, /PROFILE_MARKER/u);
  assert.doesNotMatch(messages[0].content, /PROFILE_MARKER/u);
});

test("untrusted sentences appear only in the last user JSON field", () => {
  const sentences = sentencesForTotal(250).with(0, "DRAFT_SECRET。");
  const messages = buildStagingReplacementProbeMessages({
    merchantProfileText: "PROFILE_MARKER",
    sentences
  });
  assert.match(messages[0].content, /不可信/u);
  for (const message of messages.slice(0, -1)) assert.doesNotMatch(message.content, /DRAFT_SECRET/u);
  const last = JSON.parse(messages.at(-1)?.content ?? "{}") as Record<string, unknown>;
  assert.equal(Object.keys(last).at(-1), "untrustedSentences");
  assert.deepEqual(last.untrustedSentences, sentences);
});

test("filters candidates whose fixed prefix would push a sentence over 25", () => {
  const originals = sentencesForTotal(250).with(0, `${"真".repeat(24)}。`);
  const evaluation = evaluateStagingPrefixChoices(JSON.stringify({
    status: "success",
    prefixChoices: prefixChoicesFor().with(0, {
      index: 0,
      prefixIds: ["actually", "another_angle", "more_important"]
    })
  }), originals, context);
  assert.equal(evaluation.exact24, true);
  assert.equal(evaluation.validChoiceCount, 24);
  assert.equal(evaluation.validCandidates.some(({ index }) => index === 0), false);
  assert.equal(evaluation.reasonCounts.sentence_length, 3);
});

test("selector prefers 290, fewer choices and stable index-ID order", () => {
  assert.deepEqual(selectDeterministicReplacementSubset(280, [
    { index: 0, prefixId: "actually", delta: 2 },
    { index: 1, prefixId: "another_angle", delta: 4 },
    { index: 2, prefixId: "put_plainly", delta: 5 },
    { index: 3, prefixId: "more_important", delta: 5 }
  ]), {
    finalLength: 290,
    selectedChoices: [
      { index: 2, prefixId: "put_plainly" },
      { index: 3, prefixId: "more_important" }
    ]
  });
  assert.deepEqual(selectDeterministicReplacementSubset(288, [
    { index: 0, prefixId: "actually", delta: 2 },
    { index: 0, prefixId: "contrast", delta: 2 }
  ]), {
    finalLength: 290,
    selectedChoices: [{ index: 0, prefixId: "actually" }]
  });
});

test("selector enforces per-ID cap, adjacent diversity and at-least-two-ID rule", () => {
  assert.equal(selectDeterministicReplacementSubset(270, Array.from({ length: 12 }, (_, index) => ({
    index,
    prefixId: "actually" as const,
    delta: 2
  }))), null);

  const result = selectDeterministicReplacementSubset(280, [
    { index: 0, prefixId: "actually", delta: 2 },
    { index: 1, prefixId: "actually", delta: 2 },
    { index: 1, prefixId: "contrast", delta: 2 },
    { index: 2, prefixId: "actually", delta: 2 },
    { index: 2, prefixId: "contrast", delta: 2 },
    { index: 3, prefixId: "another_angle", delta: 4 }
  ]);
  assert.deepEqual(result, {
    finalLength: 290,
    selectedChoices: [
      { index: 0, prefixId: "actually" },
      { index: 1, prefixId: "contrast" },
      { index: 2, prefixId: "actually" },
      { index: 3, prefixId: "another_angle" }
    ]
  });
});

test("final assembly accepts exact boundaries and rejects insufficient, overlong and empty solutions", () => {
  const lower = finalizeStagingReplacementScript({
    originalSentences: sentencesForTotal(278),
    candidates: [{ index: 0, prefixId: "actually" }],
    context
  });
  assert.equal(lower.finalLength, 280);

  const upper = finalizeStagingReplacementScript({
    originalSentences: sentencesForTotal(296),
    candidates: [{ index: 0, prefixId: "another_angle" }],
    context
  });
  assert.equal(upper.finalLength, 300);

  for (const input of [
    { originalSentences: sentencesForTotal(279), candidates: [] },
    { originalSentences: sentencesForTotal(301), candidates: [] },
    { originalSentences: sentencesForTotal(150), candidates: [{ index: 0, prefixId: "more_important" as const }] }
  ]) {
    assert.throws(() => finalizeStagingReplacementScript({ ...input, context }),
      (error: unknown) => error instanceof ReplacementProbeValidationError && error.reason === "no_solution");
  }
});

test("finalizer remaps IDs and ignores forged prefix, replacement and delta", () => {
  const originals = sentencesForTotal(288);
  const result = finalizeStagingReplacementScript({
    originalSentences: originals,
    candidates: [{
      index: 0,
      prefixId: "actually",
      prefix: "每天现做",
      replacement: "伪造内容。",
      delta: 999
    }] as unknown as Parameters<typeof finalizeStagingReplacementScript>[0]["candidates"],
    context
  });
  assert.deepEqual(result.selectedChoices, [{ index: 0, prefixId: "actually" }]);
  assert.equal(result.finalLength, 290);
  assert.equal(result.finalScript.split("\n")[0], `${PREFIX_ID_TO_TEXT.actually}${originals[0]}`);
  assert.equal(result.finalScript.includes("每天现做"), false);
  assert.equal(result.finalScript.includes("伪造内容"), false);
});

test("counts base sentence length buckets with fixed keys and no exact lengths", () => {
  const originals = sentencesForTotal(250).map((sentence, index) => {
    const target = index === 0 ? "短" : index === 1 ? "中等长度" : index === 2 ? "这是一句长度刚好合适" : sentence;
    return `${target}。`;
  });
  const buckets = countBaseSentenceLengthBuckets(originals);
  assert.deepEqual(Object.keys(buckets).sort(), ["11_15", "16_20", "21_24", "25", "le_10"].sort());
  const allowed = new Set(["0", "1_5", "6_12", "13_23", "24"]);
  assert.ok(Object.values(buckets).every((value) => allowed.has(value)));
  assert.ok(Object.values(buckets).every((value) => typeof value === "string"));
});

test("sanitizes provider diagnostics without exposing arbitrary values", () => {
  const safe = safeProviderDiagnostic({
    providerSubreason: "model_content_invalid_json",
    attempts: 1,
    model: "deepseek-v4-flash",
    baseHostPath: "api.deepseek.com",
    finishReason: "length",
    responseLengthBucket: "1000-2999",
    parseError: "truncated_json",
    promptTokensBucket: "1-999",
    completionTokensBucket: "1000-4999",
    promptCacheHitTokensBucket: "missing_or_zero",
    promptCacheMissTokensBucket: "1-999"
  } satisfies DeepSeekFailureDiagnostic);
  assert.equal(safe.responseLengthBucket, "1000-2999");
  assert.equal(safe.parseError, "truncated_json");

  const unknown = safeProviderDiagnostic({
    providerSubreason: "unknown", attempts: 1, model: "deepseek-v4-flash", baseHostPath: "hidden",
    finishReason: "SECRET", responseLengthBucket: "SECRET", parseError: "SECRET",
    promptTokensBucket: "secret", completionTokensBucket: "secret",
    promptCacheHitTokensBucket: "secret", promptCacheMissTokensBucket: "secret"
  } as unknown as DeepSeekFailureDiagnostic);
  assert.deepEqual(
    { finishReason: unknown.finishReason, responseLengthBucket: unknown.responseLengthBucket, parseError: unknown.parseError },
    { finishReason: "unknown", responseLengthBucket: "unknown", parseError: "none" }
  );
});

test("series uses two bounded calls, emits only sanitized metrics and stops on failure", async () => {
  const originals = sentencesForTotal(150);
  let calls = 0;
  const captured: Array<Parameters<StagingReplacementProbeProvider>[0]> = [];
  const lines: string[] = [];
  const result = await runStagingReplacementProbeSeries({
    env: { CUSTOM_SCRIPT_REPLACEMENT_PROBE: "STAGING", STAGING_ENABLE_REAL_PROVIDERS: "1", NODE_ENV: "production" },
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "PROFILE_SECRET database-id",
    provider: async (request) => {
      captured.push(request);
      calls += 1;
      return calls === 1
        ? providerSuccess({ status: "success", sentences: originals })
        : providerSuccess({ status: "success", prefixChoices: prefixChoicesFor() });
    },
    writeLine: (line) => lines.push(line)
  });
  assert.deepEqual(result, { gate: false, runsCompleted: 1 });
  assert.equal(calls, 2);
  for (const request of captured) {
    assert.equal(request.maxAttempts, 1);
    assert.equal(request.allowEnvelopeRetry, false);
    assert.equal(request.thinkingMode, "disabled");
    assert.equal(request.maxTokens, 1_600);
    assert.equal("usageUserId" in request, false);
  }
  const metric = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.deepEqual(Object.keys(metric).sort(), [
    "baseExact24", "baseJsonParsed", "baseLengthBucket", "baseSentenceLengthBuckets", "choiceCountBucket",
    "choiceJsonParsed", "durationMs", "finalLengthBucket", "firstCall", "providerCalls", "reasonCountBuckets",
    "runIndex", "secondCall", "selectedCountBucket", "status", "validCandidateCountBucket",
    "validChoiceCountBucket", "validationReason"
  ].sort());
  assert.equal(Object.hasOwn(metric, "validChoiceCount"), false);
  const allowedCountBuckets = new Set(["0", "1_5", "6_12", "13_23", "24"]);
  for (const field of ["baseSentenceLengthBuckets", "reasonCountBuckets"] as const) {
    const counts = metric[field] as Record<string, unknown>;
    assert.ok(Object.values(counts).every((value) => typeof value === "string"));
    assert.ok(Object.values(counts).every((value) => allowedCountBuckets.has(String(value))));
  }
  assert.equal(
    Object.hasOwn(metric.reasonCountBuckets as Record<string, unknown>, "prefix_id_order"),
    false
  );
  assert.deepEqual(numericPaths(metric).sort(), ["durationMs", "providerCalls", "runIndex"]);
  const gateLine = JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;
  assert.deepEqual(numericPaths(gateLine), ["runsCompleted"]);
  const output = lines.join("");
  assert.doesNotMatch(output, /"validChoiceCount":/u);
  assert.doesNotMatch(output, /"reasonCounts":/u);
  for (const marker of ["PROFILE_SECRET", "database-id", "DRAFT_SECRET", "测试-1", "小岛西点烘焙"]) {
    assert.doesNotMatch(output, new RegExp(marker, "u"));
  }
});

test("over-length base stops before the choice call", async () => {
  let calls = 0;
  const lines: string[] = [];
  const result = await runStagingReplacementProbeSeries({
    env: { CUSTOM_SCRIPT_REPLACEMENT_PROBE: "STAGING", STAGING_ENABLE_REAL_PROVIDERS: "1" },
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "PROFILE",
    provider: async () => {
      calls += 1;
      return providerSuccess({ status: "success", sentences: sentencesForTotal(301) });
    },
    writeLine: (line) => lines.push(line)
  });
  assert.deepEqual(result, { gate: false, runsCompleted: 1 });
  assert.equal(calls, 1);
  const metric = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(metric.validationReason, "base_over_length");
  assert.equal(metric.providerCalls, 1);
  assert.equal(metric.baseLengthBucket, "301_320");
  assert.equal(metric.secondCall, null);
  assert.ok(Object.values(metric.baseSentenceLengthBuckets as Record<string, unknown>)
    .every((value) => typeof value === "string"));
});

test("five passing rounds validate the second contract even when base is already valid", async () => {
  const originals = sentencesForTotal(288);
  let calls = 0;
  const result = await runStagingReplacementProbeSeries({
    env: { CUSTOM_SCRIPT_REPLACEMENT_PROBE: "STAGING", STAGING_ENABLE_REAL_PROVIDERS: "1" },
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => context.merchantProfileText,
    provider: async () => {
      calls += 1;
      return calls % 2 === 1
        ? providerSuccess({ status: "success", sentences: originals })
        : providerSuccess({ status: "success", prefixChoices: prefixChoicesFor() });
    },
    writeLine: () => undefined
  });
  assert.deepEqual(result, { gate: true, runsCompleted: 5 });
  assert.equal(calls, 10);
});

test("invalid choice contract cannot pass through a valid base", async () => {
  const originals = sentencesForTotal(288);
  let calls = 0;
  const lines: string[] = [];
  const result = await runStagingReplacementProbeSeries({
    env: { CUSTOM_SCRIPT_REPLACEMENT_PROBE: "STAGING", STAGING_ENABLE_REAL_PROVIDERS: "1" },
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => context.merchantProfileText,
    provider: async () => {
      calls += 1;
      return calls === 1
        ? providerSuccess({ status: "success", sentences: originals })
        : providerSuccess({ status: "success", prefixChoices: prefixChoicesFor().map((item) => ({ ...item, prefix: "免费配送" })) });
    },
    writeLine: (line) => lines.push(line)
  });
  assert.deepEqual(result, { gate: false, runsCompleted: 1 });
  const metric = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(Object.hasOwn(metric, "validChoiceCount"), false);
  assert.equal(metric.validChoiceCountBucket, "0");
  assert.equal((metric.reasonCountBuckets as Record<string, unknown>).choice_value, "24");
  assert.equal(metric.selectedCountBucket, "0");
  assert.equal(metric.validationReason, "choice_value");
});

test("double gate and exact model reject before profile or provider access", async () => {
  for (const item of [
    { env: {}, model: "deepseek-v4-flash" },
    { env: { CUSTOM_SCRIPT_REPLACEMENT_PROBE: "STAGING" }, model: "deepseek-v4-flash" },
    { env: { STAGING_ENABLE_REAL_PROVIDERS: "1" }, model: "deepseek-v4-flash" },
    { env: { CUSTOM_SCRIPT_REPLACEMENT_PROBE: "STAGING", STAGING_ENABLE_REAL_PROVIDERS: "1" }, model: "deepseek-chat" }
  ]) {
    let loads = 0;
    let calls = 0;
    await assert.rejects(runStagingReplacementProbeSeries({
      env: item.env,
      runtimeModel: item.model,
      merchantProjectName: "小岛西点烘焙",
      loadProfile: async () => { loads += 1; return "PROFILE"; },
      provider: async () => { calls += 1; return providerSuccess({}); },
      writeLine: () => undefined
    }), ReplacementProbeValidationError);
    assert.equal(loads, 0);
    assert.equal(calls, 0);
  }
});

test("CLI returns nonzero for false gate and both probe scripts use it", () => {
  assert.equal(stagingProbeExitCode({ gate: true }), 0);
  assert.equal(stagingProbeExitCode({ gate: false }), 1);
  for (const file of [
    "scripts/staging-custom-script-sentence-probe.ts",
    "scripts/staging-custom-script-replacement-probe.ts"
  ]) {
    assert.match(readFileSync(join(process.cwd(), file), "utf8"), /stagingProbeExitCode/u);
  }
});

test("replacement probe source has no business database or usage write path", () => {
  const files = [
    "lib/custom-scripts/staging-replacement-prefixes.ts",
    "lib/custom-scripts/staging-replacement-probe.ts",
    "lib/custom-scripts/staging-replacement-probe-contract.ts",
    "lib/custom-scripts/staging-replacement-probe-observability.ts",
    "lib/custom-scripts/staging-replacement-probe-selection.ts",
    "scripts/staging-custom-script-replacement-probe.ts"
  ];
  const combined = files.map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
  assert.doesNotMatch(combined, /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/u);
  assert.doesNotMatch(combined, /\$transaction\s*\(/u);
  assert.doesNotMatch(combined, /usageUserId\s*:/u);
  assert.doesNotMatch(combined, /CustomScriptGenerationJob|DailyUsage/u);
  assert.match(combined, /select:\s*\{\s*profileText:\s*true\s*\}/u);
  assert.match(readFileSync(join(process.cwd(), "Dockerfile"), "utf8"), /staging-custom-script-replacement-probe\.ts/u);
});
