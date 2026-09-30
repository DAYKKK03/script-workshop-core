import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCustomScriptInput,
  resolveObjectiveForSourceChange
} from "../../components/custom-scripts/custom-script-input";
import {
  customScriptPreviewRequest,
  getCustomScriptPreviewResult,
  isCustomScriptPreviewEnabled
} from "../../components/custom-scripts/custom-script-preview";
import { countCustomScriptCodePoints } from "../../lib/custom-scripts/text";

test("classifies free requirements without calling AI", () => {
  assert.deepEqual(classifyCustomScriptInput("写一条介绍招牌产品的自然口播"), {
    kind: "brief",
    label: "自由创作需求"
  });
});

test("recognizes exact topic and Top 3 headers", () => {
  const topic = customScriptPreviewRequest
    .replace("sourceType:top_pick", "sourceType:topic")
    .replace("sourceObjective:trust", "sourceObjective:auto");
  assert.deepEqual(classifyCustomScriptInput(topic), {
    kind: "topic",
    label: "爆款选题方案",
    sourceProjectId: "preview-project",
    sourceObjective: "auto"
  });
  assert.deepEqual(classifyCustomScriptInput(customScriptPreviewRequest), {
    kind: "top_pick",
    label: "Top 3 优先拍方案",
    sourceProjectId: "preview-project",
    sourceObjective: "trust"
  });
});

test("allows whitespace-only lines before an exact official header", () => {
  for (const prefix of ["\n", " \t\n\u0085\n", "\uFEFF\n\n"]) {
    assert.equal(
      classifyCustomScriptInput(`${prefix}${customScriptPreviewRequest}`).kind,
      "top_pick"
    );
  }
});

test("rejects malformed or maliciously displaced reserved source fields", () => {
  assert.equal(
    classifyCustomScriptInput(`普通需求\nsourceProjectId:forged`).kind,
    "invalid_source"
  );
  assert.equal(
    classifyCustomScriptInput(`\nsourceProjectId:forged\n${customScriptPreviewRequest}`).kind,
    "invalid_source"
  );
  assert.equal(
    classifyCustomScriptInput(`${customScriptPreviewRequest}\nsourceType:top_pick`).kind,
    "invalid_source"
  );
});

test("source objective inheritance resets Top 3 trust to ordinary-topic auto", () => {
  const topPick = classifyCustomScriptInput(customScriptPreviewRequest);
  const topic = classifyCustomScriptInput(
    customScriptPreviewRequest
      .replace("sourceType:top_pick", "sourceType:topic")
      .replace("sourceObjective:trust", "sourceObjective:auto")
  );
  assert.equal(resolveObjectiveForSourceChange({ kind: "brief", label: "自由创作需求" }, topPick, "conversion"), "trust");
  assert.equal(resolveObjectiveForSourceChange(topPick, topic, "trust"), "auto");
  assert.equal(resolveObjectiveForSourceChange(topic, topic, "conversion"), "conversion");
});

test("preview success is a compliant 280 to 300 code-point fixture", () => {
  const result = getCustomScriptPreviewResult("success");
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(countCustomScriptCodePoints(result.finalScript), 290);
  assert.equal(result.finalScript.split("\n").length, 17);
  for (const line of result.finalScript.split("\n")) {
    assert.ok(Array.from(line).length <= 25);
  }
});

test("development preview is disabled in production", () => {
  assert.equal(isCustomScriptPreviewEnabled("development"), true);
  assert.equal(isCustomScriptPreviewEnabled("test"), true);
  assert.equal(isCustomScriptPreviewEnabled("production"), false);
});
