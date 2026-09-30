import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyExtractionClaimFailure,
  summarizeExtractionJobObservation,
  summarizeDiagnosticPayload,
  summarizeDiagnosticString,
  summarizeNormalizedUrl,
  summarizeTrackedExtractionJob
} from "../../lib/douyin/diagnostics.ts";

test("summarizes strings without exposing the original value", () => {
  assert.deepEqual(summarizeDiagnosticString("sample"), {
    length: 6,
    hash8: "af2bdbe1"
  });
});

test("summarizes payloads through stable JSON serialization", () => {
  assert.deepEqual(summarizeDiagnosticPayload({ code: "AUTH", status: 401 }), {
    length: 28,
    hash8: "410234fd"
  });
});

test("summarizes normalized source URLs for provider diagnostics", () => {
  const summary = summarizeNormalizedUrl("https://v.douyin.com/POJyEEZTbNs/");

  assert.equal(summary.length, 33);
  assert.equal(summary.hash8.length, 8);
});

test("classifies queued claim failures without exposing raw job data", () => {
  assert.equal(
    classifyExtractionClaimFailure({
      candidateCount: 0,
      exhaustedCount: 0,
      counts: {
        queuedTotal: 1,
        dueCount: 0,
        notDueCount: 1,
        expiredCount: 0
      }
    }),
    "not_due"
  );

  assert.equal(
    classifyExtractionClaimFailure({
      candidateCount: 2,
      exhaustedCount: 2,
      counts: {
        queuedTotal: 2,
        dueCount: 2,
        notDueCount: 0,
        expiredCount: 0
      }
    }),
    "max_attempts"
  );
});

test("summarizes tracked queued jobs without exposing source URLs", () => {
  const now = new Date("2026-07-07T06:00:00.000Z");
  const summary = summarizeTrackedExtractionJob(
    {
      id: "job_1",
      sourceHost: "v.douyin.com",
      sourceHash: "abc123",
      status: "queued",
      sourceUrl: "https://v.douyin.com/POJyEEZTbNs/",
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: new Date("2026-07-07T05:59:59.000Z"),
      expiresAt: new Date("2026-07-07T06:05:00.000Z")
    },
    now
  );

  assert.deepEqual(summary, {
    jobId: "job_1",
    sourceHost: "v.douyin.com",
    sourceHash: "abc123",
    status: "queued",
    sourceUrlPresent: true,
    attemptCount: 0,
    maxAttempts: 3,
    availableAtDue: true,
    expiresAtValid: true
  });
});

test("summarizes extraction job observations without exposing raw user or source values", () => {
  const now = new Date("2026-07-07T06:00:00.000Z");
  const summary = summarizeExtractionJobObservation({
    event: "douyin_extraction_job_created",
    userId: "user-secret-id",
    activeJobCount: 1,
    now,
    job: {
      id: "job_2",
      sourceHost: "v.douyin.com",
      sourceHash: "hash24",
      status: "queued",
      sourceUrl: "https://v.douyin.com/POJyEEZTbNs/",
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: new Date("2026-07-07T06:00:01.000Z"),
      expiresAt: new Date("2026-07-07T06:05:00.000Z"),
      createdAt: new Date("2026-07-07T05:59:58.000Z")
    }
  });

  assert.deepEqual(summary, {
    event: "douyin_extraction_job_created",
    jobId: "job_2",
    userHash8: "e56d625c",
    sourceHost: "v.douyin.com",
    sourceHash: "hash24",
    status: "queued",
    sourceUrlPresent: true,
    attemptCount: 0,
    maxAttempts: 3,
    availableAtDue: false,
    expiresAtValid: true,
    activeJobCount: 1,
    ageMs: 2_000
  });
});
