import assert from "node:assert/strict";
import test from "node:test";
import {
  countCustomScriptCodePoints,
  countNormalizedCustomScriptCodePoints,
  normalizeCustomScriptText
} from "../../lib/custom-scripts/text";

test("normalizes custom script text with NFC, LF line endings, and boundary trim", () => {
  assert.equal(normalizeCustomScriptText(`\uFEFF e\u0301\r\n第二行\r\uFEFF`), "é\n第二行");
});

test("counts Unicode White_Space with explicit U+0085 and FEFF behavior", () => {
  assert.equal(countCustomScriptCodePoints("甲\u0085乙"), 2);
  assert.equal(countCustomScriptCodePoints("甲\uFEFF乙"), 3);
  assert.equal(countCustomScriptCodePoints("e\u0301"), 1);
  assert.equal(countNormalizedCustomScriptCodePoints(" 甲\r\n乙 "), 3);
});

test("counts input boundaries by normalized Unicode code points", () => {
  assert.equal(countNormalizedCustomScriptCodePoints("1234"), 4);
  assert.equal(countNormalizedCustomScriptCodePoints("12345"), 5);
  assert.equal(countNormalizedCustomScriptCodePoints("甲".repeat(5_000)), 5_000);
  assert.equal(countNormalizedCustomScriptCodePoints("甲".repeat(5_001)), 5_001);
  assert.equal(countNormalizedCustomScriptCodePoints("😀".repeat(5_000)), 5_000);
  assert.equal(countNormalizedCustomScriptCodePoints("😀".repeat(5_001)), 5_001);
  assert.equal(countNormalizedCustomScriptCodePoints("e\u0301".repeat(5_000)), 5_000);
  assert.equal(countNormalizedCustomScriptCodePoints("e\u0301".repeat(5_001)), 5_001);
});
