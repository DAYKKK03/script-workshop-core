import assert from "node:assert/strict";
import test from "node:test";
import {
  extractionTranscriptEmptyErrorCode,
  normalizeExtractionJobTerminalResult,
  resolveExtractionCompletion
} from "../../lib/douyin/extraction-job-contract.ts";
import { douyinTranscriptFailureMessage } from "../../lib/douyin/transcript-constants.ts";

test("treats empty completed transcripts as an internal extraction failure", () => {
  assert.deepEqual(resolveExtractionCompletion("   "), {
    status: "failed",
    errorCode: extractionTranscriptEmptyErrorCode
  });
  assert.deepEqual(resolveExtractionCompletion(null), {
    status: "failed",
    errorCode: extractionTranscriptEmptyErrorCode
  });
});

test("treats unusable completed transcripts as an internal extraction failure", () => {
  assert.deepEqual(resolveExtractionCompletion("今天开门，欢迎来吃。"), {
    status: "failed",
    errorCode: extractionTranscriptEmptyErrorCode
  });
});

test("keeps usable completed transcripts as succeeded results", () => {
  assert.deepEqual(
    resolveExtractionCompletion(
      "  今天店里刚出炉的蛋挞特别香，路过都能闻到黄油味。现在两盒还有到店活动，想吃别错过。  "
    ),
    {
      status: "succeeded",
      originalTranscript:
        "今天店里刚出炉的蛋挞特别香，路过都能闻到黄油味。现在两盒还有到店活动，想吃别错过。"
    }
  );
});

test("maps legacy succeeded-without-transcript payloads back to a failed terminal result", () => {
  assert.deepEqual(
    normalizeExtractionJobTerminalResult({
      id: "job-1",
      status: "succeeded",
      originalTranscript: null
    }),
    {
      id: "job-1",
      status: "failed",
      message: douyinTranscriptFailureMessage
    }
  );
});

test("maps legacy succeeded-with-unusable-transcript payloads back to a failed terminal result", () => {
  assert.deepEqual(
    normalizeExtractionJobTerminalResult({
      id: "job-2",
      status: "succeeded",
      originalTranscript: "今天开门，欢迎来吃。"
    }),
    {
      id: "job-2",
      status: "failed",
      message: douyinTranscriptFailureMessage
    }
  );
});
