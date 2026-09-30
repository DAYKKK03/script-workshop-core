import assert from "node:assert/strict";
import test from "node:test";
import {
  isUsableReferenceTranscript,
  normalizeReferenceTranscript,
  resolveReferenceTranscriptInput
} from "../../lib/scripts/reference-transcript.ts";

test("normalizes whitespace before transcript checks", () => {
  assert.equal(
    normalizeReferenceTranscript("  第一段\r\n第二段  "),
    "第一段 第二段"
  );
});

test("accepts transcripts with enough length and meaningful segments", () => {
  assert.equal(
    isUsableReferenceTranscript(
      "今天来店里先看刚出炉的蛋挞，黄油香味一下就出来了。现在两盒活动还送饮品，路过的顾客基本都会停下来问一嘴。"
    ),
    true
  );
});

test("rejects transcripts that are too short for reliable structure analysis", () => {
  assert.equal(isUsableReferenceTranscript("今天开门，欢迎来吃。"), false);
  assert.equal(isUsableReferenceTranscript("只有一句很长但没有第二个完整意思段落"), false);
});

test("does not treat a long unpunctuated sentence as a reliable structure input", () => {
  const longUnpunctuatedTranscript =
    "今天我们准备了现烤烧烤和新鲜食材欢迎大家下班后来店里坐一坐慢慢吃慢慢聊感受烟火气和热闹氛围";

  assert.equal(longUnpunctuatedTranscript.length >= 40, true);
  assert.equal(isUsableReferenceTranscript(longUnpunctuatedTranscript), false);
});

test("rejects empty transcript input before analyze-reference", () => {
  assert.deepEqual(resolveReferenceTranscriptInput("   "), {
    status: "failed",
    errorCode: "ORIGINAL_TRANSCRIPT_REQUIRED",
    message: "原口播文案不能为空"
  });
});

test("rejects unusable transcript input before analyze-reference", () => {
  assert.deepEqual(resolveReferenceTranscriptInput("今天开门，欢迎来吃。"), {
    status: "failed",
    errorCode: "REFERENCE_TRANSCRIPT_TOO_SHORT",
    message: "参考脚本拆解失败，请稍后重试"
  });
});
