import assert from "node:assert/strict";
import test from "node:test";

test("retries transient extraction failures while attempts remain", async () => {
  const policy = await import("../../lib/douyin/extraction-worker-policy.ts").catch(
    () => ({ shouldRetryExtractionFailure: undefined })
  );

  assert.equal(typeof policy.shouldRetryExtractionFailure, "function");
  assert.equal(
    policy.shouldRetryExtractionFailure?.({
      errorCode: "ASR_QUERY_REQUEST_FAILED",
      attemptCount: 1,
      maxAttempts: 3
    }),
    true
  );
  assert.equal(
    policy.shouldRetryExtractionFailure?.({
      errorCode: "TIKHUB_PROVIDER_TRANSIENT_FAILED",
      attemptCount: 1,
      maxAttempts: 3
    }),
    true
  );
  assert.equal(
    policy.shouldRetryExtractionFailure?.({
      errorCode: "TIKHUB_PROVIDER_AUTH_FAILED",
      attemptCount: 1,
      maxAttempts: 3
    }),
    false
  );
  assert.equal(
    policy.shouldRetryExtractionFailure?.({
      errorCode: "ASR_QUERY_TIMEOUT",
      attemptCount: 3,
      maxAttempts: 3
    }),
    false
  );
  assert.equal(
    policy.shouldRetryExtractionFailure?.({
      errorCode: "ASR_SUBMIT_FAILED__submit_timeout",
      attemptCount: 1,
      maxAttempts: 3
    }),
    true
  );
});

test("identifies processing jobs whose worker lock expired", async () => {
  const policy = await import("../../lib/douyin/extraction-worker-policy.ts").catch(
    () => ({ isExtractionLockStale: undefined })
  );

  assert.equal(typeof policy.isExtractionLockStale, "function");

  const now = new Date("2026-06-27T10:00:00.000Z");
  assert.equal(
    policy.isExtractionLockStale?.({
      lockedAt: new Date("2026-06-27T09:50:00.000Z"),
      now,
      lockTimeoutMs: 5 * 60 * 1000
    }),
    true
  );
  assert.equal(
    policy.isExtractionLockStale?.({
      lockedAt: new Date("2026-06-27T09:58:00.000Z"),
      now,
      lockTimeoutMs: 5 * 60 * 1000
    }),
    false
  );
});

test("clamps worker concurrency to a safe small range", async () => {
  const policy = await import("../../lib/douyin/extraction-worker-policy.ts").catch(
    () => ({ getExtractionWorkerConcurrency: undefined })
  );

  assert.equal(typeof policy.getExtractionWorkerConcurrency, "function");
  assert.equal(policy.getExtractionWorkerConcurrency?.(), 2);
  assert.equal(policy.getExtractionWorkerConcurrency?.("2"), 2);
  assert.equal(policy.getExtractionWorkerConcurrency?.("0"), 1);
  assert.equal(policy.getExtractionWorkerConcurrency?.("99"), 2);
});

test("never allows more than two active extraction jobs per user", async () => {
  const policy = await import("../../lib/douyin/extraction-worker-policy.ts").catch(
    () => ({ getExtractionUserConcurrencyLimit: undefined })
  );

  assert.equal(typeof policy.getExtractionUserConcurrencyLimit, "function");
  assert.equal(policy.getExtractionUserConcurrencyLimit?.(), 2);
  assert.equal(policy.getExtractionUserConcurrencyLimit?.("9"), 2);
  assert.equal(policy.getExtractionUserConcurrencyLimit?.("1"), 1);
});

test("uses each job's persisted retry limit when deciding if it can run", async () => {
  const policy = await import("../../lib/douyin/extraction-worker-policy.ts").catch(
    () => ({ canAttemptExtractionJob: undefined })
  );

  assert.equal(typeof policy.canAttemptExtractionJob, "function");
  assert.equal(policy.canAttemptExtractionJob?.({ attemptCount: 1, maxAttempts: 2 }), true);
  assert.equal(policy.canAttemptExtractionJob?.({ attemptCount: 2, maxAttempts: 2 }), false);
  assert.equal(policy.canAttemptExtractionJob?.({ attemptCount: 2, maxAttempts: 3 }), true);
});
