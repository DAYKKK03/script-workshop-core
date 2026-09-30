import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { DeepSeekJsonResult } from "../../lib/ai/deepseek-runtime";
import type { CustomScriptAttemptResult } from "../../lib/custom-scripts/service-runtime";
import {
  LinkFirstProbeValidationError,
  requestStagingLinkFirstProbeAttempt,
  runStagingLinkFirstProbeSeries
} from "../../lib/custom-scripts/staging-link-first-probe";

const enabledEnv = {
  CUSTOM_SCRIPT_LINK_FIRST_PROBE: "STAGING",
  STAGING_ENABLE_REAL_PROVIDERS: "1"
};

const acceptedDiagnostic = {
  finishReason: "stop",
  responseLengthBucket: "1-999",
  parserReason: "none",
  promptTokensBucket: "1000-4999",
  completionTokensBucket: "1-999",
  thinkingMode: "disabled" as const
};

function scriptForLength(length: number) {
  const punctuationCount = Math.ceil(length / 20);
  const contentLength = length - punctuationCount;
  const base = Math.floor(contentLength / punctuationCount);
  let remainder = contentLength % punctuationCount;
  return Array.from({ length: punctuationCount }, () => {
    const current = base + (remainder-- > 0 ? 1 : 0);
    return `${"真".repeat(current)}。`;
  }).join("\n");
}

function successAttempt(length = 260): CustomScriptAttemptResult {
  return {
    status: "success",
    result: { status: "success", finalScript: scriptForLength(length) },
    diagnostic: acceptedDiagnostic
  };
}

test("runs five serial product attempts and emits only the approved sanitized fields", async () => {
  const output: string[] = [];
  let calls = 0;
  const result = await runStagingLinkFirstProbeSeries({
    env: enabledEnv,
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "PROFILE_SECRET",
    attempt: async () => {
      calls += 1;
      return successAttempt(calls === 1 ? 150 : calls === 2 ? 220 : calls === 5 ? 320 : 260);
    },
    writeLine: (line) => output.push(line),
    now: (() => {
      let value = 1_000;
      return () => value += 10;
    })()
  });

  assert.deepEqual(result, { gate: true, runsCompleted: 5 });
  assert.equal(calls, 5);
  assert.equal(output.length, 6);
  const metrics = output.slice(0, 5).map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.deepEqual(metrics.map((item) => item.lengthBucket), ["80_199", "200_239", "240_299", "240_299", "300_350"]);
  for (const metric of metrics) {
    assert.deepEqual(Object.keys(metric).sort(), [
      "durationMs",
      "finishReason",
      "lengthBucket",
      "parserReason",
      "providerCalls",
      "providerSubreason",
      "runIndex",
      "scriptLengthBucket",
      "status"
    ].sort());
    assert.equal(metric.status, "passed");
    assert.equal(metric.providerCalls, 1);
    assert.equal(metric.scriptLengthBucket, "accepted");
  }
  assert.deepEqual(JSON.parse(output[5]), { gate: true, runsCompleted: 5 });
  assert.doesNotMatch(output.join(""), /PROFILE_SECRET|finalScript|merchantProfile|requestText/u);
});

test("retries one invalid response with the same fresh-repair contract and then passes", async () => {
  const repairs: unknown[] = [];
  let calls = 0;
  const output: string[] = [];
  const result = await runStagingLinkFirstProbeSeries({
    env: enabledEnv,
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "主营甜品和下午茶。",
    attempt: async (input) => {
      calls += 1;
      repairs.push(input.repair);
      if (calls === 1) {
        return {
          status: "invalid",
          reason: "length",
          repairMode: "fresh",
          repairContext: { actualCount: 79, direction: "short", lengthBucket: "under_80" },
          diagnostic: {
            parserReason: "length",
            scriptLengthBucket: "under_80",
            scriptLengthDirection: "short",
            finishReason: "stop"
          }
        };
      }
      return successAttempt();
    },
    writeLine: (line) => output.push(line)
  });

  assert.equal(result.gate, true);
  assert.equal(calls, 6);
  assert.equal(repairs[0], undefined);
  assert.deepEqual(repairs[1], {
    reason: "length",
    repairMode: "fresh",
    repairContext: { actualCount: 79, direction: "short", lengthBucket: "under_80" }
  });
  const firstRun = JSON.parse(output[0]) as Record<string, unknown>;
  assert.equal(firstRun.providerCalls, 2);
  assert.equal(firstRun.status, "passed");
});

test("stops after the second invalid result and keeps failure diagnostics sanitized", async () => {
  let calls = 0;
  const output: string[] = [];
  const result = await runStagingLinkFirstProbeSeries({
    env: enabledEnv,
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "PROFILE_SECRET",
    attempt: async () => {
      calls += 1;
      return {
        status: "invalid",
        reason: "json_syntax",
        diagnostic: {
          parserReason: "json_syntax",
          finishReason: "length",
          providerSubreason: "model_content_invalid_json",
          scriptLengthBucket: "under_80"
        }
      };
    },
    writeLine: (line) => output.push(line)
  });

  assert.deepEqual(result, { gate: false, runsCompleted: 1 });
  assert.equal(calls, 2);
  assert.equal(output.length, 2);
  const metric = JSON.parse(output[0]) as Record<string, unknown>;
  assert.equal(typeof metric.durationMs, "number");
  assert.deepEqual({ ...metric, durationMs: 0 }, {
    runIndex: 1,
    status: "invalid",
    providerCalls: 2,
    durationMs: 0,
    lengthBucket: "not_returned",
    parserReason: "json_syntax",
    scriptLengthBucket: "under_80",
    finishReason: "length",
    providerSubreason: "model_content_invalid_json"
  });
  assert.deepEqual(JSON.parse(output[1]), { gate: false, runsCompleted: 1 });
  assert.doesNotMatch(output.join(""), /PROFILE_SECRET/u);
});

test("provider failures are terminal and are not retried", async () => {
  let calls = 0;
  const result = await runStagingLinkFirstProbeSeries({
    env: enabledEnv,
    runtimeModel: "deepseek-v4-flash",
    merchantProjectName: "小岛西点烘焙",
    loadProfile: async () => "主营甜品和下午茶。",
    attempt: async () => {
      calls += 1;
      return {
        status: "provider_failed",
        errorCode: "CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE",
        diagnostic: { providerSubreason: "timeout", finishReason: "unknown" }
      };
    },
    writeLine: () => undefined
  });

  assert.deepEqual(result, { gate: false, runsCompleted: 1 });
  assert.equal(calls, 1);
});

test("requires both staging gates and the production custom-script model before reading a profile", async () => {
  for (const item of [
    { env: {}, model: "deepseek-v4-flash" },
    { env: { CUSTOM_SCRIPT_LINK_FIRST_PROBE: "STAGING" }, model: "deepseek-v4-flash" },
    { env: { STAGING_ENABLE_REAL_PROVIDERS: "1" }, model: "deepseek-v4-flash" },
    { env: enabledEnv, model: "deepseek-chat" }
  ]) {
    let loads = 0;
    let calls = 0;
    await assert.rejects(
      runStagingLinkFirstProbeSeries({
        env: item.env,
        runtimeModel: item.model,
        merchantProjectName: "小岛西点烘焙",
        loadProfile: async () => { loads += 1; return "PROFILE"; },
        attempt: async () => { calls += 1; return successAttempt(); },
        writeLine: () => undefined
      }),
      LinkFirstProbeValidationError
    );
    assert.equal(loads, 0);
    assert.equal(calls, 0);
  }
});

test("service attempt strips usage attribution before calling the real provider boundary", async () => {
  let captured: Record<string, unknown> | undefined;
  const providerResult: DeepSeekJsonResult = {
    status: "success",
    content: JSON.stringify({ status: "success", finalScript: scriptForLength(260) }),
    diagnostic: { attempts: 1, finishReason: "stop", thinkingMode: "disabled" }
  };
  const result = await requestStagingLinkFirstProbeAttempt({
    userId: "staging-link-first-probe",
    merchantProjectName: "小岛西点烘焙",
    merchantProfileText: "主营甜品和下午茶。",
    requestText: "写一条附近上班族下午茶口播。",
    objective: "trust",
    tone: "natural",
    timeoutMs: 10_000
  }, async (request) => {
    captured = request as unknown as Record<string, unknown>;
    return providerResult;
  });

  assert.equal(result.status, "success");
  assert.equal(captured && "usageUserId" in captured, false);
});

test("probe files have no Job, DailyUsage, generic Prisma write, prefixId or prefix repair path", () => {
  const paths = [
    "lib/custom-scripts/staging-link-first-probe.ts",
    "scripts/staging-custom-script-link-first-probe.ts",
    ".github/workflows/staging-custom-script-link-first-probe.yml"
  ];
  const source = paths.map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
  assert.doesNotMatch(source, /CustomScriptGenerationJob|DailyUsage|dailyUsage/u);
  assert.doesNotMatch(source, /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/u);
  assert.doesNotMatch(source, /\$transaction\s*\(/u);
  assert.doesNotMatch(source, /prefixId|replacement-probe|staging-replacement/u);
  assert.match(source, /requestCustomScriptAttempt/u);
});

test("workflow is manual-only, staging-scoped, and verifies the deployed SHA", () => {
  const source = readFileSync(
    join(process.cwd(), ".github/workflows/staging-custom-script-link-first-probe.yml"),
    "utf8"
  );
  assert.match(source, /workflow_dispatch:/u);
  assert.doesNotMatch(source, /^\s*(?:push|pull_request|schedule):/mu);
  assert.match(source, /environment:\s*staging/u);
  assert.match(source, /GITHUB_SHA/u);
  assert.match(source, /\.deployed-image-tag/u);
  assert.match(source, /custom-script-worker/u);
});
