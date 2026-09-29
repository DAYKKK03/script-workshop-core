import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canRequeueRecoverableTopicFailure,
  getTopicJobRetryMinimumRemainingMs,
  isRecoverableTopicProviderFailure,
  topicRemainingBudgetBucket
} from "../../lib/topics/job-policy.ts";
import { serializeTopicJobOutcome } from "../../lib/topics/jobs.ts";

test("only the explicit transient Provider/format failure whitelist is recoverable", () => {
  for (const code of [
    "AI_PROVIDER_EMPTY_RESPONSE",
    "AI_PROVIDER_INVALID_JSON",
    "AI_PROVIDER_INVALID_RESPONSE",
    "AI_PROVIDER_NETWORK_ERROR",
    "AI_PROVIDER_TIMEOUT"
  ]) assert.equal(isRecoverableTopicProviderFailure(code), true, code);

  for (const code of [
    "AI_PROVIDER_HTTP_ERROR",
    "AI_PROVIDER_NOT_CONFIGURED",
    "AI_PROVIDER_UNSAFE_RESPONSE",
    "PROJECT_PROFILE_CHANGED",
    "DAILY_TOPIC_LIMIT_REACHED",
    "TOPIC_JOB_CANCELED",
    "TOPIC_JOB_TIMED_OUT"
  ]) assert.equal(isRecoverableTopicProviderFailure(code), false, code);
});

test("a recoverable first claim may requeue once without extending the run deadline", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");
  const deadline = new Date(now.getTime() + getTopicJobRetryMinimumRemainingMs() + 1);
  assert.equal(canRequeueRecoverableTopicFailure({ errorCode: "AI_PROVIDER_INVALID_JSON", attemptCount: 1, maxAttempts: 2, runDeadlineAt: deadline, now }), true);
  assert.equal(canRequeueRecoverableTopicFailure({ errorCode: "AI_PROVIDER_INVALID_JSON", attemptCount: 2, maxAttempts: 2, runDeadlineAt: deadline, now }), false);
  assert.equal(canRequeueRecoverableTopicFailure({ errorCode: "PROJECT_PROFILE_CHANGED", attemptCount: 1, maxAttempts: 2, runDeadlineAt: deadline, now }), false);
  assert.equal(canRequeueRecoverableTopicFailure({ errorCode: "AI_PROVIDER_TIMEOUT", attemptCount: 1, maxAttempts: 2, runDeadlineAt: new Date(now.getTime() + getTopicJobRetryMinimumRemainingMs()), now }), false);
});

test("remaining run budget is logged only as a coarse bucket", () => {
  const now = 1_000_000;
  assert.equal(topicRemainingBudgetBucket(now + 1, now), "under_30s");
  assert.equal(topicRemainingBudgetBucket(now + 45_000, now), "30_60s");
  assert.equal(topicRemainingBudgetBucket(now + 90_000, now), "1_2m");
  assert.equal(topicRemainingBudgetBucket(now + 180_000, now), "2_5m");
  assert.equal(topicRemainingBudgetBucket(now + 600_000, now), "over_5m");
});

test("terminal and requeue diagnostics carry only a safe job hash and allowlisted fields", () => {
  const rawJobId = "cm123456789012345678901234";
  const outcome = JSON.parse(serializeTopicJobOutcome(
    "topic_generation_requeued",
    "AI_PROVIDER_INVALID_RESPONSE",
    Date.now(),
    { batchIndex: 2, parserReason: "json_syntax", finishReason: "length", responseLengthBucket: "1_100", remainingBudgetBucket: "provider_value" },
    { id: rawJobId, attemptCount: 1, runDeadlineAt: new Date(Date.now() + 45_000) }
  ));
  assert.equal(outcome.errorCode, "AI_PROVIDER_INVALID_RESPONSE");
  assert.equal(outcome.batchIndex, 2);
  assert.equal(outcome.parserReason, "json_syntax");
  assert.equal(outcome.finishReason, "length");
  assert.equal(outcome.responseLengthBucket, "1_100");
  assert.equal(outcome.attemptCount, 1);
  assert.equal(outcome.remainingBudgetBucket, "30_60s");
  assert.match(outcome.jobHash, /^[0-9a-f]{12}$/);
  assert.doesNotMatch(JSON.stringify(outcome), new RegExp(rawJobId));
});

test("worker failure handling requeues only the owned first claim and leaves crash recovery separate", async () => {
  const [jobs, worker, workbench] = await Promise.all([
    readFile(new URL("../../lib/topics/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../../lib/topics/worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/topics/topic-ideas-workbench.tsx", import.meta.url), "utf8")
  ]);
  assert.match(jobs, /handleTopicJobFailure/);
  assert.match(jobs, /status: "queued", availableAt: now, errorCode: null, lockedAt: null, lockedBy: null/);
  assert.match(jobs, /canRequeueRecoverableTopicFailure/);
  assert.match(jobs, /topicRemainingBudgetBucket/);
  assert.match(jobs, /jobHash/);
  assert.match(worker, /TOPIC_WORKER_INTERRUPTED/);
  assert.doesNotMatch(worker, /handleTopicJobFailure/);
  assert.match(workbench, /if \(job\.status !== "queued" && job\.status !== "processing"\)/);
  assert.doesNotMatch(workbench, /status === "queued"[\s\S]{0,200}crypto\.randomUUID\(\)/);
});
