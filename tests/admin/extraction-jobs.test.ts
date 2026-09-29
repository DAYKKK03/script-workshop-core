import assert from "node:assert/strict";
import test from "node:test";
import {
  serializeAdminExtractionJob,
  summarizeTranscriptState
} from "../../lib/admin/extraction-jobs.ts";

test("summarizes transcript retention without exposing content", () => {
  assert.equal(summarizeTranscriptState(null), "none");
  assert.equal(summarizeTranscriptState("a".repeat(24)), "1-99");
  assert.equal(summarizeTranscriptState("a".repeat(120)), "100-499");
  assert.equal(summarizeTranscriptState("a".repeat(520)), "500+");
});

test("serializes admin extraction rows with only sanitized identifiers", () => {
  const row = serializeAdminExtractionJob({
    id: "job-secret-id",
    userId: "user-secret-id",
    projectId: "project-secret-id",
    sourceHost: "v.douyin.com",
    sourceHash: "dc4e79f7bc259312ff5a070e",
    status: "failed",
    errorCode:
      "ASR_SUBMIT_FAILED__fr=submit_timeout__smk=audio__smf=mp3__smp=music.play_url__cc=2__ck=audio%2Cvideo__cf=mp3%2Cmp4__cp=music.play_url%2Cvideo.play_addr_265",
    attemptCount: 3,
    maxAttempts: 3,
    createdAt: new Date("2026-07-08T02:00:00.000Z"),
    updatedAt: new Date("2026-07-08T02:01:00.000Z"),
    availableAt: new Date("2026-07-08T02:00:10.000Z"),
    lockedAt: null,
    expiresAt: new Date("2026-07-08T02:30:00.000Z"),
    transcript: "这是一段不应该进入后台列表明文展示的测试 transcript"
  });

  assert.equal(row.jobHash8.length, 8);
  assert.equal(row.userHash8.length, 8);
  assert.equal(row.projectHash8?.length, 8);
  assert.equal(row.sourceHost, "v.douyin.com");
  assert.equal(row.sourceHash, "dc4e79f7bc259312ff5a070e");
  assert.equal(row.errorCode, "ASR_SUBMIT_FAILED");
  assert.equal(row.failureReason, "submit_timeout");
  assert.equal(row.selectedMediaSummary, "audio / mp3 / music.play_url");
  assert.equal(
    row.candidateSummary,
    "count=2 | kinds=audio,video | formats=mp3,mp4 | paths=music.play_url,video.play_addr_265"
  );
  assert.equal(row.attemptSummary, "3/3");
  assert.equal(row.transcriptState, "1-99");
  assert.ok(!Object.values(row).includes("job-secret-id"));
  assert.ok(!Object.values(row).includes("user-secret-id"));
  assert.ok(!Object.values(row).includes("project-secret-id"));
  assert.ok(
    !Object.values(row).some(
      (value) => typeof value === "string" && value.includes("测试 transcript")
    )
  );
});

test("keeps extraction rows readable when no sanitized subreason exists", () => {
  const row = serializeAdminExtractionJob({
    id: "job-id-2",
    userId: "user-id-2",
    projectId: null,
    sourceHost: "v.douyin.com",
    sourceHash: "source-hash-2",
    status: "failed",
    errorCode: "TIKHUB_PROVIDER_REQUEST_FAILED",
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: new Date("2026-07-08T02:00:00.000Z"),
    updatedAt: new Date("2026-07-08T02:01:00.000Z"),
    availableAt: new Date("2026-07-08T02:00:10.000Z"),
    lockedAt: null,
    expiresAt: null,
    transcript: null
  });

  assert.equal(row.errorCode, "TIKHUB_PROVIDER_REQUEST_FAILED");
  assert.equal(row.failureReason, null);
  assert.equal(row.selectedMediaSummary, null);
  assert.equal(row.candidateSummary, null);
});
