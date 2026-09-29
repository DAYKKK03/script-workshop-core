import assert from "node:assert/strict";
import test from "node:test";
import { extractDouyinUrl, isDouyinUrl } from "../../lib/douyin/source-input.ts";

test("accepts a bare Douyin URL", () => {
  assert.equal(
    extractDouyinUrl("https://v.douyin.com/example/"),
    "https://v.douyin.com/example/"
  );
});

test("extracts a Douyin URL from a complete share message", () => {
  assert.equal(
    extractDouyinUrl(
      "复制打开抖音，看看这个视频 https://v.douyin.com/example/ 01/23"
    ),
    "https://v.douyin.com/example/"
  );
});

test("selects the first allowed Douyin URL instead of another platform URL", () => {
  assert.equal(
    extractDouyinUrl(
      "介绍 https://example.com/a 再看 https://www.douyin.com/video/1。"
    ),
    "https://www.douyin.com/video/1"
  );
});

test("rejects text without an allowed Douyin URL", () => {
  assert.equal(extractDouyinUrl("没有抖音链接"), null);
  assert.equal(isDouyinUrl("https://example.com/video/1"), false);
});

test("rejects oversized share text before URL parsing", () => {
  assert.equal(extractDouyinUrl(`${"x".repeat(4001)} https://v.douyin.com/example/`), null);
});
