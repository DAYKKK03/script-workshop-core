import assert from "node:assert/strict";
import test from "node:test";
import {
  createCustomScriptQualityFallback,
  parseCustomScriptQualityFallback
} from "../../lib/custom-scripts/quality-fallback";
import { parseStoredCustomScriptPublicResult } from "../../lib/custom-scripts/jobs";

function scriptOfLength(count: number) {
  return `${"真".repeat(count - 1)}。`;
}

test("quality fallback accepts only the strict private shape and an exact 80-199 count", () => {
  for (const count of [80, 150, 199]) {
    const stored = createCustomScriptQualityFallback(scriptOfLength(count), "top_pick");
    assert.deepEqual(stored, {
      status: "quality_fallback",
      finalScript: scriptOfLength(count),
      characterCount: count,
      inputType: "top_pick"
    });
    assert.deepEqual(parseCustomScriptQualityFallback(stored), stored);
  }

  for (const value of [
    null,
    { status: "quality_fallback", finalScript: scriptOfLength(79), characterCount: 79, inputType: "brief" },
    { status: "quality_fallback", finalScript: scriptOfLength(200), characterCount: 200, inputType: "brief" },
    { status: "quality_fallback", finalScript: scriptOfLength(150), characterCount: 149, inputType: "brief" },
    { status: "quality_fallback", finalScript: scriptOfLength(150), characterCount: 150, inputType: "unknown" },
    { status: "quality_fallback", finalScript: scriptOfLength(150), characterCount: 150, inputType: "brief", extra: true }
  ]) {
    assert.equal(parseCustomScriptQualityFallback(value), undefined);
  }
});

test("quality fallback creation rejects text outside the recoverable range", () => {
  assert.throws(() => createCustomScriptQualityFallback(scriptOfLength(79), "brief"));
  assert.throws(() => createCustomScriptQualityFallback(scriptOfLength(200), "topic"));
});

test("public result parsing hides the processing-only quality fallback", () => {
  const fallback = createCustomScriptQualityFallback(scriptOfLength(150), "brief");
  assert.equal(parseStoredCustomScriptPublicResult(fallback), undefined);
  assert.deepEqual(parseStoredCustomScriptPublicResult({
    status: "success",
    finalScript: scriptOfLength(200),
    characterCount: 200,
    inputType: "brief"
  }), {
    status: "success",
    finalScript: scriptOfLength(200),
    characterCount: 200,
    inputType: "brief"
  });
});
