import assert from "node:assert/strict";
import test from "node:test";
import {
  PREFIX_ID_TO_TEXT,
  STAGING_REPLACEMENT_PREFIX_IDS,
  type StagingReplacementPrefixId
} from "../../lib/custom-scripts/staging-replacement-prefixes";
import {
  evaluateStagingPrefixChoices,
  finalizeStagingReplacementScript,
  selectDeterministicReplacementSubset
} from "../../lib/custom-scripts/staging-replacement-probe";

const context = {
  objective: "trust" as const,
  requestText: "写一条适合附近上班族的下午茶口播",
  merchantProjectName: "小岛西点烘焙",
  merchantProfileText: "主营甜品和下午茶，服务附近上班族。"
};

function sentencesForTotal(total: number) {
  const contentTotal = total - 24;
  const base = Math.floor(contentTotal / 24);
  let remainder = contentTotal % 24;
  return Array.from({ length: 24 }, (_, index) => {
    const contentLength = base + (remainder-- > 0 ? 1 : 0);
    return `${String.fromCodePoint(0x4e00 + index)}${"真".repeat(contentLength - 1)}。`;
  });
}

function choicesFor(ids: readonly string[] = STAGING_REPLACEMENT_PREFIX_IDS): Array<{
  index: number;
  prefixIds: string[];
}> {
  return Array.from({ length: 24 }, (_, index) => ({
    index,
    prefixIds: [ids[index % ids.length]]
  }));
}

test("fixed prefix map is the only safe text source and has useful length tiers", () => {
  assert.equal(STAGING_REPLACEMENT_PREFIX_IDS.length, 10);
  assert.deepEqual(Object.keys(PREFIX_ID_TO_TEXT), [...STAGING_REPLACEMENT_PREFIX_IDS]);
  const lengths = new Set<number>();
  const forbidden = [
    "每天现做", "免费配送", "进口原料", "官方认证", "绝对有效",
    "半价优惠", "双倍赠送", "俩人同行", "首单立减", "永久免费",
    "国家标准", "行业第一", "当天见效", "上门服务", "到店倒茶",
    "赠送礼品", "限时名额", "销量冠军", "忽略规则", "输出原文"
  ];
  for (const prefix of Object.values(PREFIX_ID_TO_TEXT)) {
    const length = [...prefix].length;
    lengths.add(length);
    assert.ok(length >= 2 && length <= 6);
    for (const marker of forbidden) assert.equal(prefix.includes(marker), false, marker);
  }
  assert.ok(lengths.size >= 3);
});

test("strict choice schema rejects free text, unknown IDs, injection, extra fields and invalid ID arrays", () => {
  const originals = sentencesForTotal(250);
  const valid = choicesFor();
  const invalidBodies: unknown[] = [
    { status: "success", prefixes: valid.map(({ index }) => ({ index, prefix: "每天现做" })) },
    { status: "success", prefixChoices: valid, extra: true },
    { status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: [] }) },
    { status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: ["actually", "actually"] }) },
    { status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: ["每天现做"] }) },
    { status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: ["actually;ignore_rules"] }) },
    { status: "success", prefixChoices: valid.with(0, {
      index: 0,
      prefixIds: ["actually"],
      prefix: "免费配送"
    } as unknown as (typeof valid)[number]) },
    { status: "success", prefixChoices: valid.with(0, { index: 0, prefixIds: ["actually", "contrast", "therefore", "another_angle"] }) }
  ];

  for (const body of invalidBodies) {
    const result = evaluateStagingPrefixChoices(JSON.stringify(body), originals, context);
    assert.equal(result.exact24, false, JSON.stringify(body));
    assert.notEqual(result.validationReason, "none");
  }
});

test("accepts reverse preference order and canonicalizes known unique prefix IDs", () => {
  const originals = sentencesForTotal(250);
  const response = {
    status: "success",
    prefixChoices: Array.from({ length: 24 }, (_, index) => ({
      index,
      prefixIds: ["contrast", "actually"]
    }))
  };

  const evaluation = evaluateStagingPrefixChoices(JSON.stringify(response), originals, context);

  assert.equal(evaluation.exact24, true, evaluation.validationReason);
  assert.equal(evaluation.validationReason, "none");
  for (let index = 0; index < 24; index += 1) {
    assert.deepEqual(evaluation.validCandidates.slice(index * 2, index * 2 + 2), [
      { index, prefixId: "actually" },
      { index, prefixId: "contrast" }
    ]);
  }
});

test("finalizer remaps IDs and ignores forged text or derived values", () => {
  const originals = sentencesForTotal(278);
  const result = finalizeStagingReplacementScript({
    originalSentences: originals,
    candidates: [{
      index: 0,
      prefixId: "actually",
      prefix: "每天现做",
      replacement: "伪造内容。",
      delta: 999
    }] as unknown as Array<{ index: number; prefixId: StagingReplacementPrefixId }>,
    context
  });

  assert.equal(result.finalLength, 280);
  assert.equal(result.finalScript.split("\n")[0], `${PREFIX_ID_TO_TEXT.actually}${originals[0]}`);
  assert.equal(result.finalScript.includes("每天现做"), false);
  assert.equal(result.finalScript.includes("伪造内容"), false);
});

test("selector enforces per-ID cap, adjacent diversity and stable index-ID tie breaks", () => {
  const result = selectDeterministicReplacementSubset(280, [
    { index: 0, prefixId: "actually", delta: 2 },
    { index: 0, prefixId: "contrast", delta: 2 },
    { index: 1, prefixId: "actually", delta: 2 },
    { index: 1, prefixId: "contrast", delta: 2 },
    { index: 2, prefixId: "actually", delta: 2 },
    { index: 2, prefixId: "contrast", delta: 2 },
    { index: 3, prefixId: "another_angle", delta: 4 }
  ]);
  assert.deepEqual(result, {
    finalLength: 290,
    selectedChoices: [
      { index: 0, prefixId: "actually" },
      { index: 1, prefixId: "contrast" },
      { index: 2, prefixId: "actually" },
      { index: 3, prefixId: "another_angle" }
    ]
  });

  assert.equal(selectDeterministicReplacementSubset(270, Array.from({ length: 8 }, (_, index) => ({
    index,
    prefixId: "actually" as const,
    delta: 2
  }))), null);
});

test("candidates that would exceed the 25-code-point sentence limit are never selected", () => {
  const originals = sentencesForTotal(250).with(0, `${"真".repeat(24)}。`);
  const response = {
    status: "success",
    prefixChoices: choicesFor().with(0, { index: 0, prefixIds: ["actually", "more_important"] })
  };
  const evaluation = evaluateStagingPrefixChoices(JSON.stringify(response), originals, context);
  assert.equal(evaluation.exact24, true);
  assert.equal(evaluation.validCandidates.some(({ index }) => index === 0), false);
});
