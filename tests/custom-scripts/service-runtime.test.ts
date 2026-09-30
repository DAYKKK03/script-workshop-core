import assert from "node:assert/strict";
import test from "node:test";
import type { DeepSeekJsonResult } from "../../lib/ai/deepseek-runtime";
import { requestCustomScriptAttempt, type CustomScriptProvider } from "../../lib/custom-scripts/service-runtime";

function compliantScript() {
  return Array.from({ length: 20 }, () => "附近上班族选下午茶别只看外表。").join("\n");
}

function exactFifteenLineScript(count: number, firstPrefix = "下午茶") {
  const lineCount = 15;
  const baseLength = Math.floor(count / lineCount);
  let remainder = count % lineCount;
  return Array.from({ length: lineCount }, (_, index) => {
    const lineLength = baseLength + (remainder-- > 0 ? 1 : 0);
    const prefix = index === 0 ? firstPrefix : "下午茶";
    return `${prefix}${"真".repeat(lineLength - Array.from(prefix).length - 1)}。`;
  }).join("\n");
}

function successProvider(content: string, capture?: (input: Parameters<CustomScriptProvider>[0]) => void): CustomScriptProvider {
  return async (input) => {
    capture?.(input);
    return {
      status: "success",
      content,
      diagnostic: {
        attempts: 1,
        finishReason: "stop",
        responseLengthBucket: "1-999",
        promptCacheHitTokensBucket: "1-999",
        promptCacheMissTokensBucket: "1000-4999",
        thinkingMode: "disabled"
      }
    } satisfies DeepSeekJsonResult;
  };
}

const base = {
  userId: "user-a",
  merchantProjectName: "小岛西点烘焙",
  merchantProfileText: "主营甜品，服务附近上班族下午茶。",
  requestText: "写一条下午茶口播",
  objective: "trust" as const,
  tone: "natural" as const,
  timeoutMs: 10_000
};

test("executes one non-thinking provider call with nested retries disabled", async () => {
  let request: Parameters<CustomScriptProvider>[0] | undefined;
  const result = await requestCustomScriptAttempt(
    base,
    successProvider(JSON.stringify({ status: "success", finalScript: compliantScript() }), (value) => { request = value; })
  );
  assert.equal(result.status, "success");
  assert.equal(request?.maxAttempts, 1);
  assert.equal(request?.allowEnvelopeRetry, false);
  assert.equal(request?.thinkingMode, "disabled");
  assert.equal(request?.temperature, 0.75);
  assert.match(request?.messages[1]?.content || "", /"merchantProjectName":"小岛西点烘焙"/u);
  assert.equal(result.diagnostic.promptCacheHitTokensBucket, "1-999");
  assert.equal(result.diagnostic.promptCacheMissTokensBucket, "1000-4999");
});

test("separates semantic invalid output from provider transport failures", async () => {
  const invalid = await requestCustomScriptAttempt(
    base,
    successProvider(JSON.stringify({ status: "success", finalScript: "太短。" }))
  );
  assert.equal(invalid.status, "invalid");
  if (invalid.status === "invalid") {
    assert.equal(invalid.reason, "length");
    assert.deepEqual(invalid.repairContext, {
      actualCount: 3,
      direction: "short",
      lengthBucket: "under_80"
    });
    assert.equal(invalid.diagnostic.scriptLengthBucket, "under_80");
    assert.equal(invalid.diagnostic.scriptLengthDirection, "short");
    assert.equal(invalid.diagnostic.lineCountBucket, "under_5");
  }

  const unavailable = await requestCustomScriptAttempt(base, async () => ({
    status: "failed",
    errorCode: "AI_PROVIDER_FAILED",
    message: "safe",
    diagnostic: {
      providerSubreason: "network_error",
      attempts: 1,
      model: "test-model",
      baseHostPath: "example.test/v1"
    }
  }));
  assert.equal(unavailable.status, "provider_failed");
});

test("all parsed-script validation failures carry only a line-count range", async () => {
  const malformed = "。".repeat(240);
  const result = await requestCustomScriptAttempt(
    base,
    successProvider(JSON.stringify({ status: "success", finalScript: malformed }))
  );
  assert.equal(result.status, "invalid");
  if (result.status === "invalid") {
    assert.equal(result.reason, "non_speech_content");
    assert.equal(result.diagnostic.lineCountBucket, "under_5");
    assert.equal("lineCount" in result.diagnostic, false);
  }
});

test("accepts flexible natural speech layouts on the first provider call", async () => {
  const scripts = [
    "真".repeat(150),
    `${"真".repeat(79)}。${"实".repeat(79)}。${"近".repeat(79)}。`,
    `${"近".repeat(120)}\n${"店".repeat(119)}。`,
    `${"真".repeat(239)}。`
  ];

  for (const finalScript of scripts) {
    let providerCalls = 0;
    const result = await requestCustomScriptAttempt(base, async (input) => {
      providerCalls += 1;
      return successProvider(JSON.stringify({ status: "success", finalScript }))(input);
    });
    assert.equal(result.status, "success");
    assert.equal(providerCalls, 1);
  }
});

test("accepts every safe script in the 80-350 safety band without returning a draft", async () => {
  for (const count of [80, 150, 199, 200, 350]) {
    let providerCalls = 0;
    const result = await requestCustomScriptAttempt(base, async (input) => {
      providerCalls += 1;
      return successProvider(JSON.stringify({ status: "success", finalScript: exactFifteenLineScript(count) }))(input);
    });
    assert.equal(result.status, "success");
    assert.equal(providerCalls, 1);
  }

  const result = await requestCustomScriptAttempt(
    base,
    successProvider(JSON.stringify({ status: "success", finalScript: exactFifteenLineScript(79) }))
  );
  assert.equal(result.status, "invalid");
  if (result.status === "invalid") {
    assert.equal(result.reason, "length");
    assert.equal(result.repairMode, "fresh");
    assert.equal("validatedDraft" in result, false);
  }
});

test("non-length deterministic failures win before length and never return a draft", async () => {
  const safeShort = exactFifteenLineScript(240);
  const cases = [
    {
      expected: "fact_safety",
      script: exactFifteenLineScript(240, "只要30元"),
      input: base
    },
    {
      expected: "forbidden_expression",
      script: exactFifteenLineScript(240, "家人们谁懂啊"),
      input: base
    },
    {
      expected: "list_or_heading",
      script: exactFifteenLineScript(240, "1.下午茶"),
      input: base
    },
    {
      expected: "non_speech_content",
      script: exactFifteenLineScript(150, "😀下午茶"),
      input: base
    },
    {
      expected: "non_speech_content",
      script: exactFifteenLineScript(150, "{{产品}}"),
      input: base
    },
    {
      expected: "cta",
      script: exactFifteenLineScript(150, "请点赞"),
      input: base
    },
    {
      expected: "duplicate_previous",
      script: safeShort,
      input: { ...base, previousScript: safeShort }
    }
  ] as const;

  for (const item of cases) {
    const result = await requestCustomScriptAttempt(
      item.input,
      successProvider(JSON.stringify({ status: "success", finalScript: item.script }))
    );
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      assert.equal(result.reason, item.expected);
      assert.equal("validatedDraft" in result, false);
    }
  }
});

test("prompt permits useful general knowledge without turning it into merchant facts", async () => {
  let request: Parameters<CustomScriptProvider>[0] | undefined;
  await requestCustomScriptAttempt(
    base,
    successProvider(
      JSON.stringify({ status: "success", finalScript: compliantScript() }),
      (value) => { request = value; }
    )
  );

  const prompt = request?.messages.map((message) => message.content).join("\n") || "";
  assert.match(prompt, /低风险通用行业知识/u);
  assert.match(prompt, /原因解释/u);
  assert.match(prompt, /判断标准/u);
  assert.match(prompt, /可执行方法/u);
  assert.match(prompt, /适用边界或风险提醒/u);
  assert.match(prompt, /至少.*两类/u);
  assert.match(prompt, /不得把通用知识写成当前商家事实/u);
  assert.match(prompt, /不得生成医疗诊断、治疗方案、处方或效果保证/u);
  assert.match(prompt, /不得编造精确标准、技术参数或无依据数字/u);
  assert.match(prompt, /差：只写商家专业靠谱/u);
  assert.match(prompt, /好：先解释常见误区的原因/u);
  assert.doesNotMatch(prompt, /32KB/u);
});

test("prompt defines value-first objective blueprints", async () => {
  for (const [objective, expected] of [
    ["auto", /自动：价值优先.*知识或信任/u],
    ["traffic", /引流：钩子.*误区或原因.*两项有用信息/u],
    ["trust", /信任：解释原因.*判断方法.*局限或风险/u],
    ["conversion", /转化：先给有用信息.*临近结尾.*一个自然轻引导/u]
  ] as const) {
    let request: Parameters<CustomScriptProvider>[0] | undefined;
    await requestCustomScriptAttempt(
      { ...base, objective },
      successProvider(
        JSON.stringify({ status: "success", finalScript: compliantScript() }),
        (value) => { request = value; }
      )
    );
    const prompt = request?.messages.map((message) => message.content).join("\n") || "";
    assert.match(prompt, expected);
  }
});

test("quality enrichment is a fresh request without the first safe draft", async () => {
  let request: Parameters<CustomScriptProvider>[0] | undefined;
  await requestCustomScriptAttempt(
    {
      ...base,
      repair: { reason: "quality_enrichment", repairMode: "fresh" }
    },
    successProvider(
      JSON.stringify({ status: "success", finalScript: compliantScript() }),
      (value) => { request = value; }
    )
  );

  const requestData = JSON.parse(request?.messages.at(-1)?.content || "{}") as Record<string, unknown>;
  const prompt = request?.messages.map((message) => message.content).join("\n") || "";
  assert.equal(requestData.repairMode, "fresh");
  assert.equal("serverCount" in requestData, false);
  assert.equal("firstSafeDraft" in requestData, false);
  assert.match(String(requestData.repairInstruction), /质量增强/u);
  assert.match(String(requestData.repairInstruction), /原因解释.*判断标准.*可执行方法.*适用边界或风险提醒/u);
  assert.match(prompt, /240—300/u);
  assert.equal(request?.temperature, 0.5);
});

test("length repair prompt targets 240-300 without the rejected body", async () => {
  for (const item of [
    { count: 79, direction: "short", bucket: "under_80", expected: /补充.*场景.*解释.*感受.*选择逻辑/u },
    { count: 351, direction: "long", bucket: "351_360", expected: /删除.*重复修饰.*次要表达/u }
  ] as const) {
    let request: Parameters<CustomScriptProvider>[0] | undefined;
    const invalidBodyMarker = `无效正文-${item.count}`;
    await requestCustomScriptAttempt(
      {
        ...base,
        repair: {
          reason: "length",
          repairMode: "fresh",
          repairContext: {
            actualCount: item.count,
            direction: item.direction,
            lengthBucket: item.bucket
          }
        }
      },
      successProvider(JSON.stringify({ status: "success", finalScript: compliantScript() }), (value) => { request = value; })
    );

    const prompt = request?.messages.map((message) => message.content).join("\n") || "";
    assert.match(prompt, new RegExp(`服务端计数.{0,4}${item.count}`, "u"));
    assert.match(prompt, item.expected);
    assert.match(prompt, /240—300/u);
    assert.match(prompt, /200—350/u);
    assert.doesNotMatch(prompt, /80—350/u);
    assert.doesNotMatch(prompt, /15个非空行/u);
    assert.doesNotMatch(prompt, /每行.*19—20/u);
    if (item.direction === "short") {
      assert.match(prompt, /完整安全口播优先/u);
      assert.doesNotMatch(prompt, /至少补足/u);
    }
    assert.match(prompt, /不得新增.*价格.*活动.*地址.*工艺.*数据.*资质.*功效.*服务事实/u);
    assert.doesNotMatch(prompt, new RegExp(invalidBodyMarker, "u"));
    assert.doesNotMatch(prompt, /charCount/u);
    assert.equal(request?.maxTokens, 1_600);
    assert.equal(request?.thinkingMode, "disabled");
    assert.equal(request?.temperature, 0.5);
  }
});

test("maps empty provider content to a retryable semantic reason", async () => {
  const result = await requestCustomScriptAttempt(base, async () => ({
    status: "failed",
    errorCode: "AI_PROVIDER_FAILED",
    message: "safe",
    diagnostic: {
      providerSubreason: "empty_content",
      attempts: 1,
      model: "test-model",
      baseHostPath: "example.test/v1"
    }
  }));
  assert.equal(result.status, "invalid");
  if (result.status === "invalid") {
    assert.equal(result.reason, "empty_content");
    assert.equal(result.diagnostic.parserReason, "empty_content");
    assert.equal(result.repairContext, undefined);
  }
});

test("rejects invalid JSON and invalid domain shapes", async () => {
  for (const [content, expected] of [
    ["{", "json_syntax"],
    [JSON.stringify({ status: "success" }), "shape"]
  ] as const) {
    const result = await requestCustomScriptAttempt(base, successProvider(content));
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") assert.equal(result.reason, expected);
  }
});
