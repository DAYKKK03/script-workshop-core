import assert from "node:assert/strict";
import test from "node:test";
import {
  persistAndLogCustomScriptTerminal,
  resolveCustomScriptTerminalOutcome,
  serializeCustomScriptOutcome
} from "../../lib/custom-scripts/job-outcomes";
import { withCustomScriptHeartbeat } from "../../lib/custom-scripts/job-heartbeat";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("heartbeat rejection is handled immediately and prevents terminal work", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  let terminalWrites = 0;
  try {
    const outcome = await withCustomScriptHeartbeat(
      "job-a",
      "lease-a",
      async (lease) => {
        await wait(15);
        if (await lease.canContinue()) terminalWrites += 1;
      },
      {
        intervalMs: 1,
        renewLease: async () => { throw new Error("database unavailable"); }
      }
    );
    await wait(0);
    assert.equal(outcome.status, "lease_lost");
    assert.equal(terminalWrites, 0);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("heartbeat update count zero enters lease-lost without reporting success", async () => {
  let terminalWrites = 0;
  const outcome = await withCustomScriptHeartbeat(
    "job-b",
    "lease-b",
    async (lease) => {
      await wait(15);
      if (await lease.canContinue()) terminalWrites += 1;
    },
    { intervalMs: 1, renewLease: async () => ({ count: 0 }) }
  );

  assert.equal(outcome.status, "lease_lost");
  assert.equal(terminalWrites, 0);
});

test("short task completes normally before the first heartbeat", async () => {
  let heartbeatCalls = 0;
  const outcome = await withCustomScriptHeartbeat(
    "job-short",
    "lease-short",
    async (lease) => {
      assert.equal(await lease.canContinue(), true);
      return "done";
    },
    {
      intervalMs: 1_000,
      renewLease: async () => {
        heartbeatCalls += 1;
        return { count: 1 };
      }
    }
  );

  assert.deepEqual(outcome, { status: "completed", value: "done" });
  assert.equal(heartbeatCalls, 0);
});

test("terminal events are emitted only for committed writes", () => {
  for (const completedEvent of [
    "custom_script_needs_profile",
    "custom_script_failed_provider",
    "custom_script_failed_final_invalid",
    "custom_script_failed_timeout"
  ]) {
    assert.deepEqual(resolveCustomScriptTerminalOutcome(true, completedEvent), {
      status: "completed",
      event: completedEvent
    });
    assert.deepEqual(resolveCustomScriptTerminalOutcome(false, completedEvent), {
      status: "lease_lost",
      event: "custom_script_completion_lost",
      errorCode: "CUSTOM_SCRIPT_COMPLETION_LOST"
    });
  }
});

test("needs-profile, provider, invalid and timeout races log completion-lost only", async () => {
  const cases = [
    { event: "custom_script_needs_profile", errorCode: undefined },
    { event: "custom_script_failed", errorCode: "AI_PROVIDER_FAILED" },
    { event: "custom_script_failed", errorCode: "CUSTOM_SCRIPT_OUTPUT_INVALID" },
    { event: "custom_script_failed", errorCode: "CUSTOM_SCRIPT_RUN_TIMEOUT" }
  ];

  for (const item of cases) {
    const lines: string[] = [];
    const outcome = await persistAndLogCustomScriptTerminal({
      write: async () => false,
      completedEvent: item.event,
      jobId: "job-race",
      startedAt: Date.now(),
      errorCode: item.errorCode,
      semanticAttempt: 2,
      writeLine: (line) => lines.push(line)
    });
    assert.equal(outcome, "lease_lost");
    assert.equal(lines.length, 1);
    const logged = JSON.parse(lines[0]) as { event: string; errorCode?: string };
    assert.equal(logged.event, "custom_script_completion_lost");
    assert.equal(logged.errorCode, "CUSTOM_SCRIPT_COMPLETION_LOST");
  }
});

test("validation logs expose only allowlisted length direction, length bucket and line-count bucket", () => {
  const serialized = serializeCustomScriptOutcome({
    event: "custom_script_validation_invalid",
    jobId: "job-length",
    startedAt: Date.now(),
    semanticAttempt: 1,
    diagnostic: {
      parserReason: "length",
      scriptLengthDirection: "short",
      scriptLengthBucket: "351_360",
      lineCountBucket: "10_14"
    }
  });
  const logged = JSON.parse(serialized) as Record<string, unknown>;

  assert.equal(logged.event, "custom_script_validation_invalid");
  assert.equal(logged.parserReason, "length");
  assert.equal(logged.scriptLengthDirection, "short");
  assert.equal(logged.scriptLengthBucket, "351_360");
  assert.equal(logged.lineCountBucket, "10_14");
  assert.equal("actualCount" in logged, false);
  assert.equal("lineCount" in logged, false);
  assert.doesNotMatch(serialized, /无效正文|merchant|prompt|finalScript/u);

  const rejected = JSON.parse(serializeCustomScriptOutcome({
    event: "custom_script_validation_invalid",
    jobId: "job-length-invalid",
    startedAt: Date.now(),
    semanticAttempt: 1,
    diagnostic: {
      scriptLengthDirection: "sideways",
      scriptLengthBucket: "exact_260",
      lineCountBucket: "exact_12"
    } as unknown as Parameters<typeof serializeCustomScriptOutcome>[0]["diagnostic"]
  })) as Record<string, unknown>;
  assert.equal("scriptLengthDirection" in rejected, false);
  assert.equal("scriptLengthBucket" in rejected, false);
  assert.equal("lineCountBucket" in rejected, false);

  const draftInjection = JSON.parse(serializeCustomScriptOutcome({
    event: "custom_script_validation_invalid",
    jobId: "job-draft-invalid",
    startedAt: Date.now(),
    semanticAttempt: 1,
    diagnostic: {
      parserReason: "length",
      lineCountBucket: "15_20",
      validatedDraft: "draft-must-never-be-logged",
      exactLineCount: 15
    } as unknown as Parameters<typeof serializeCustomScriptOutcome>[0]["diagnostic"]
  })) as Record<string, unknown>;
  assert.equal("validatedDraft" in draftInjection, false);
  assert.equal("exactLineCount" in draftInjection, false);
  assert.doesNotMatch(JSON.stringify(draftInjection), /draft-must-never-be-logged/u);
});
