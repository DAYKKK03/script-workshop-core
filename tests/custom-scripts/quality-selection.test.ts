import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldAttemptCustomScriptQualityEnrichment,
  shouldUseCustomScriptQualityCandidate
} from "../../lib/custom-scripts/length-repair";
import { customScriptQualityProviderTimeoutMs } from "../../lib/custom-scripts/job-policy";

test("quality enrichment is soft only for safe scripts below the product target", () => {
  for (const count of [80, 150, 199]) {
    assert.equal(shouldAttemptCustomScriptQualityEnrichment(count), true);
  }
  for (const count of [79, 200, 300, 350, 351]) {
    assert.equal(shouldAttemptCustomScriptQualityEnrichment(count), false);
  }
});

test("quality selection prefers the product range then the longer safe draft", () => {
  assert.equal(shouldUseCustomScriptQualityCandidate(150, 250), true);
  assert.equal(shouldUseCustomScriptQualityCandidate(150, 180), true);
  assert.equal(shouldUseCustomScriptQualityCandidate(150, 120), false);
  assert.equal(shouldUseCustomScriptQualityCandidate(250, 180), false);
});

test("quality enrichment reserves time to commit the safe fallback", () => {
  assert.equal(customScriptQualityProviderTimeoutMs(40_000), 0);
  assert.equal(customScriptQualityProviderTimeoutMs(40_001), 1);
  assert.equal(customScriptQualityProviderTimeoutMs(120_000), 80_000);
});
