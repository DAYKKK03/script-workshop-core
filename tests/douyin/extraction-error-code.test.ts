import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeExtractionErrorCode,
  getExtractionErrorBaseCode,
  parseExtractionErrorCode
} from "../../lib/douyin/extraction-error-code.ts";

test("encodes ASR submit failure detail into a safe persisted error code", () => {
  const encoded = encodeExtractionErrorCode({
    errorCode: "ASR_SUBMIT_FAILED",
    diagnostic: {
      provider: "asr",
      failureReason: "submit_timeout",
      selectedMediaKind: "audio",
      selectedMediaFormat: "mp3",
      selectedMediaPath: "music.play_url",
      candidateCount: 2,
      candidateKinds: "audio,video",
      candidateFormats: "mp3,mp4",
      candidatePaths: "music.play_url,video.play_addr_265"
    }
  });

  assert.match(encoded, /^ASR_SUBMIT_FAILED__/);
  assert.deepEqual(parseExtractionErrorCode(encoded), {
    rawCode: encoded,
    baseCode: "ASR_SUBMIT_FAILED",
    safeDetail: "submit_timeout",
    selectedMediaKind: "audio",
    selectedMediaFormat: "mp3",
    selectedMediaPath: "music.play_url",
    candidateCount: 2,
    candidateKinds: "audio,video",
    candidateFormats: "mp3,mp4",
    candidatePaths: "music.play_url,video.play_addr_265"
  });
});

test("keeps non-detailed extraction errors unchanged", () => {
  assert.equal(
    encodeExtractionErrorCode({
      errorCode: "TIKHUB_PROVIDER_REQUEST_FAILED",
      diagnostic: {
        provider: "tikhub",
        failureReason: "submit_timeout"
      }
    }),
    "TIKHUB_PROVIDER_REQUEST_FAILED"
  );

  assert.equal(
    getExtractionErrorBaseCode("ASR_SUBMIT_FAILED__submit_unsupported_media"),
    "ASR_SUBMIT_FAILED"
  );
  assert.equal(
    getExtractionErrorBaseCode("EXTRACTION_TRANSCRIPT_EMPTY"),
    "EXTRACTION_TRANSCRIPT_EMPTY"
  );
});

test("downgrades unknown ASR submit detail to a safe fallback label", () => {
  assert.deepEqual(parseExtractionErrorCode("ASR_SUBMIT_FAILED__unexpected_branch"), {
    rawCode: "ASR_SUBMIT_FAILED__unexpected_branch",
    baseCode: "ASR_SUBMIT_FAILED",
    safeDetail: "unknown_submit_failure",
    selectedMediaKind: null,
    selectedMediaFormat: null,
    selectedMediaPath: null,
    candidateCount: null,
    candidateKinds: null,
    candidateFormats: null,
    candidatePaths: null
  });
});
