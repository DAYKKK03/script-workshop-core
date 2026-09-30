import assert from "node:assert/strict";
import test from "node:test";

test("maps timestamps to the Asia Shanghai calendar date", async () => {
  const usage = await import("../../lib/usage/policy.ts").catch(() => ({
    getShanghaiUsageDate: undefined
  }));

  assert.equal(typeof usage.getShanghaiUsageDate, "function");
  assert.equal(
    usage.getShanghaiUsageDate?.(new Date("2026-06-26T16:30:00.000Z")).toISOString(),
    "2026-06-27T00:00:00.000Z"
  );
});

test("calculates estimated provider cost in micro CNY", async () => {
  const usage = await import("../../lib/usage/policy.ts").catch(() => ({
    calculateEstimatedCostMicros: undefined
  }));

  const cost = usage.calculateEstimatedCostMicros?.({
    deepseekInputTokens: 1_000_000,
    deepseekOutputTokens: 500_000,
    asrAudioSeconds: 120,
    tikhubRequests: 2,
    prices: {
      deepseekInputCnyPerMillion: 2,
      deepseekOutputCnyPerMillion: 8,
      asrCnyPerHour: 3.6,
      tikhubCnyPerRequest: 0.01
    }
  });

  assert.equal(cost, 6_140_000);
});

test("blocks successful script generation at the configured daily limit", async () => {
  const usage = await import("../../lib/usage/policy.ts").catch(() => ({
    hasReachedDailyScriptLimit: undefined
  }));

  assert.equal(
    usage.hasReachedDailyScriptLimit?.({ scriptsGenerated: 29, limit: 30 }),
    false
  );
  assert.equal(
    usage.hasReachedDailyScriptLimit?.({ scriptsGenerated: 30, limit: 30 }),
    true
  );
});

test("blocks successful topic generation at the configured daily limit", async () => {
  const usage = await import("../../lib/usage/policy.ts").catch(() => ({
    hasReachedDailyTopicLimit: undefined
  }));

  assert.equal(
    usage.hasReachedDailyTopicLimit?.({ topicIdeasGenerated: 4, limit: 5 }),
    false
  );
  assert.equal(
    usage.hasReachedDailyTopicLimit?.({ topicIdeasGenerated: 5, limit: 5 }),
    true
  );
});
