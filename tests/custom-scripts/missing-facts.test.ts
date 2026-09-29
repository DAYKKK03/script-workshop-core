import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CUSTOM_SCRIPT_MISSING_FACTS,
  MISSING_FACT_CODES,
  MISSING_FACT_LABELS
} from "../../lib/custom-scripts/missing-facts";
import { buildCustomScriptMessages } from "../../lib/custom-scripts/prompt";
import { missingFactLabels } from "../../components/custom-scripts/custom-script-types";

const expected = [
  ["main_product", "主营产品"],
  ["core_selling_point", "核心卖点"],
  ["target_audience", "目标人群"],
  ["consumption_scene", "消费场景"],
  ["price", "价格"],
  ["promotion", "活动"],
  ["address_or_service_area", "地址或服务区域"],
  ["service_process", "服务流程"],
  ["qualification", "资质"],
  ["proof_or_case", "证据或案例"],
  ["effect_claim", "效果依据"],
  ["production_process", "生产或制作流程"],
  ["materials_or_ingredients", "材料、原料或成分"],
  ["service_action", "服务动作"],
  ["business_hours", "营业时间"],
  ["contact_method", "联系方式"],
  ["business_data", "经营数据"],
  ["warranty_or_after_sales", "质保或售后"]
] as const;

test("missing fact codes and Chinese labels have one client-safe source", () => {
  assert.deepEqual(CUSTOM_SCRIPT_MISSING_FACTS.map(({ code, label }) => [code, label]), expected);
  assert.deepEqual(MISSING_FACT_CODES, expected.map(([code]) => code));
  assert.deepEqual(MISSING_FACT_LABELS, Object.fromEntries(expected));
  assert.deepEqual(missingFactLabels, MISSING_FACT_LABELS);
});

test("prompt includes every canonical code and label exactly once", () => {
  const [system] = buildCustomScriptMessages({
    merchantProjectName: "测试商家",
    merchantProfileText: "主营甜品",
    requestText: "写下午茶",
    objective: "trust",
    tone: "natural"
  });
  for (const [code, label] of expected) {
    assert.equal(system.content.split(`${code}=${label}`).length - 1, 1);
  }
});

test("the browser mapping does not import server-only or Node runtime modules", async () => {
  const [shared, clientTypes] = await Promise.all([
    readFile(new URL("../../lib/custom-scripts/missing-facts.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/custom-scripts/custom-script-types.ts", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(shared, /server-only|node:crypto|node:/);
  assert.match(clientTypes, /@\/lib\/custom-scripts\/missing-facts/);
  assert.doesNotMatch(clientTypes, /@\/lib\/custom-scripts\/contracts/);
});
