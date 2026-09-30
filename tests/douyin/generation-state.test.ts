import assert from "node:assert/strict";
import test from "node:test";
import {
  getGenerationInputResetScope,
  getSourceResetScope,
  getUsableExtractionTranscript
} from "../../lib/douyin/generation-state.ts";
import { extractDouyinUrl } from "../../lib/douyin/source-input.ts";

test("retains reference state when raw text contains the same normalized source", () => {
  assert.equal(
    getSourceResetScope(
      "https://v.douyin.com/example/",
      extractDouyinUrl("复制打开抖音 https://v.douyin.com/example/ 看视频")
    ),
    "none"
  );
});

test("clears reference and final output when the normalized source changes", () => {
  assert.equal(
    getSourceResetScope(
      "https://v.douyin.com/example/",
      extractDouyinUrl("https://www.douyin.com/video/2")
    ),
    "reference-and-final"
  );
  assert.equal(
    getSourceResetScope(
      "https://v.douyin.com/example/",
      extractDouyinUrl("正在修改来源")
    ),
    "reference-and-final"
  );
});

test("project or duration changes clear final output only", () => {
  assert.equal(getGenerationInputResetScope("project-a", "project-b"), "final-only");
  assert.equal(getGenerationInputResetScope("30-60", "60-90"), "final-only");
  assert.equal(getGenerationInputResetScope("30-60", "30-60"), "none");
});

test("only allows analyze-reference to continue when succeeded jobs carry a usable transcript", () => {
  assert.equal(
    getUsableExtractionTranscript({
      status: "succeeded",
      originalTranscript:
        "  今天店里刚出炉的蛋挞特别香，路过都能闻到黄油味。现在两盒还有到店活动，想吃别错过。  "
    }),
    "今天店里刚出炉的蛋挞特别香，路过都能闻到黄油味。现在两盒还有到店活动，想吃别错过。"
  );
  assert.equal(
    getUsableExtractionTranscript({
      status: "succeeded",
      originalTranscript: "   "
    }),
    undefined
  );
  assert.equal(
    getUsableExtractionTranscript({
      status: "failed",
      originalTranscript: "不会被使用"
    }),
    undefined
  );
  assert.equal(
    getUsableExtractionTranscript({
      status: "succeeded",
      originalTranscript: "今天开门，欢迎来吃。"
    }),
    undefined
  );
});
