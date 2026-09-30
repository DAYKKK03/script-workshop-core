import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  canAttemptTopicJob,
  getTopicJobLockTimeoutMs,
  getTopicJobHeartbeatIntervalMs,
  getTopicJobRunTimeoutMs,
  getTopicJobTtlMs
} from "../../lib/topics/job-policy.ts";
import { serializeTopicJobOutcome } from "../../lib/topics/jobs.ts";

test("topic jobs stop after their configured attempt limit", () => {
  assert.equal(canAttemptTopicJob({ attemptCount: 0, maxAttempts: 2 }), true);
  assert.equal(canAttemptTopicJob({ attemptCount: 1, maxAttempts: 2 }), true);
  assert.equal(canAttemptTopicJob({ attemptCount: 2, maxAttempts: 2 }), false);
});

test("topic job retention and stale-lock defaults are positive", () => {
  assert.ok(getTopicJobTtlMs() > 0);
  assert.ok(getTopicJobLockTimeoutMs() > 0);
  assert.ok(getTopicJobHeartbeatIntervalMs() < getTopicJobLockTimeoutMs());
  assert.equal(getTopicJobRunTimeoutMs(), 5 * 60_000);
});

test("topic jobs use separate total-run and retention deadlines", async () => {
  const [schema, jobs] = await Promise.all([
    readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../../lib/topics/jobs.ts", import.meta.url), "utf8")
  ]);
  assert.match(schema, /runDeadlineAt\s+DateTime/);
  assert.match(schema, /TopicGenerationJobStatus[\s\S]*canceled/);
  assert.match(jobs, /TOPIC_JOB_TIMED_OUT/);
  assert.match(jobs, /runDeadlineAt: \{ gt: new Date\(\) \}/);
});

test("topic generation batches six bounded provider requests before the job deadline", async () => {
  const source = await readFile(new URL("../../lib/topics/service-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /providerMaxAttempts: 1/);
  assert.match(source, /audienceSceneIndex < 5/);
  assert.match(source, /providerTimeoutMs: 45_000/);
  assert.match(source, /deadlineAt/);
  assert.match(source, /providerMaxTokens: 2500/);
  assert.match(source, /providerMaxTokens: 2000/);
  assert.match(source, /semanticMaxAttempts: 2/);
  assert.match(source, /truncated_json/);
  assert.match(source, /input\.shouldContinue/);
});

test("topic worker records only sanitized failure diagnostics", async () => {
  const source = await readFile(new URL("../../lib/topics/jobs.ts", import.meta.url), "utf8");
  assert.match(source, /providerSubreason/);
  assert.match(source, /semanticAttempts/);
  assert.match(source, /durationMs/);
  assert.match(source, /finishReason/);
  assert.match(source, /responseLengthBucket/);
  assert.match(source, /parseError/);
  assert.match(source, /parserReason/);
  const logFunction = source.slice(source.indexOf("function logTopicJobOutcome"), source.indexOf("export function normalizeTopicClientRequestId"));
  assert.doesNotMatch(logFunction, /profileText|merchantProfile|reasoningContent|modelContent|apiKey/);
});

test("topic repair success and failure logs expose only the allowlisted repair stage", () => {
  const success = JSON.parse(serializeTopicJobOutcome("topic_generation_succeeded", undefined, Date.now(), { duplicateRepairStage: "validated" }));
  const failed = JSON.parse(serializeTopicJobOutcome("topic_generation_failed", "AI_PROVIDER_INVALID_RESPONSE", Date.now(), { duplicateRepairStage: "failed", batchIndex: 2, parserReason: "missing_or_invalid_field" }));
  assert.equal(success.duplicateRepairStage, "validated");
  assert.equal(failed.duplicateRepairStage, "failed");
  assert.equal(failed.batchIndex, 2);
  assert.equal(failed.parserReason, "missing_or_invalid_field");
  assert.doesNotMatch(JSON.stringify({ success, failed }), /title|opening|hook|profileText|merchant/);
});
