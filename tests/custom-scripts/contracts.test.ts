import assert from "node:assert/strict";
import test from "node:test";
import {
  CustomScriptValidationError,
  MISSING_FACT_CODES,
  canonicalCustomScriptInputHash,
  createCustomScriptLineCountBucket,
  extractCustomScriptNumericFactTokens,
  parseOfficialTopicSource,
  validateCustomScriptDomainOutput,
  validateCustomScriptRequestBody
} from "../../lib/custom-scripts/contracts";
import { buildCustomScriptMessages } from "../../lib/custom-scripts/prompt";

function compliantScript(line = "附近上班族选下午茶别只看外表。") {
  return Array.from({ length: 20 }, () => line).join("\n");
}

function exactLengthScript(count: number) {
  const lineCount = Math.ceil(count / 25);
  const baseLength = Math.floor(count / lineCount);
  let remainder = count % lineCount;
  return Array.from({ length: lineCount }, () => {
    const lineLength = baseLength + (remainder-- > 0 ? 1 : 0);
    const prefix = "附近上班族下午茶";
    return `${prefix}${"真".repeat(lineLength - Array.from(prefix).length - 1)}。`;
  }).join("\n");
}

test("validates canonical request fields and hashes every business field", () => {
  const base = validateCustomScriptRequestBody({
    clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
    projectId: "project-a",
    requestText: " 写一条下午茶口播 ",
    objective: "traffic",
    tone: "natural"
  });
  assert.equal(base.requestText, "写一条下午茶口播");
  assert.equal(canonicalCustomScriptInputHash(base), canonicalCustomScriptInputHash({ ...base }));
  assert.notEqual(
    canonicalCustomScriptInputHash(base),
    canonicalCustomScriptInputHash({ ...base, tone: "professional" })
  );
  assert.throws(
    () => validateCustomScriptRequestBody({ ...base, requestText: "四字" }),
    CustomScriptValidationError
  );
  assert.throws(
    () => validateCustomScriptRequestBody({ ...base, requestText: "😀".repeat(5_001) }),
    CustomScriptValidationError
  );
});

test("server parser accepts only the exact five-line official source header", () => {
  const requestText = [
    "\uFEFF  ",
    "【脚本工坊爆款选题】",
    "sourceProjectId: project-a",
    "sourceType: top_pick",
    "sourceObjective: trust",
    "商家项目：同名门店",
    "选题正文"
  ].join("\n");
  assert.deepEqual(parseOfficialTopicSource(requestText), {
    inputType: "top_pick",
    sourceProjectId: "project-a",
    sourceType: "top_pick",
    sourceObjective: "trust"
  });
  assert.equal(parseOfficialTopicSource("写一条真实口播").inputType, "brief");
  assert.throws(
    () => parseOfficialTopicSource(`${requestText}\nsourceProjectId: project-b`),
    CustomScriptValidationError
  );
});

test("accepts only the two AI domain results and all 18 missing fact codes", () => {
  assert.equal(MISSING_FACT_CODES.length, 18);
  assert.equal(new Set(MISSING_FACT_CODES).size, 18);
  assert.deepEqual(
    validateCustomScriptDomainOutput(
      { status: "needs_profile", missingFacts: [...MISSING_FACT_CODES].slice(0, 5) },
      { objective: "trust", requestText: "需要商家资料", merchantProjectName: "测试商家", merchantProfileText: "主营甜品" }
    ),
    { status: "needs_profile", missingFacts: [...MISSING_FACT_CODES].slice(0, 5) }
  );
  assert.throws(
    () => validateCustomScriptDomainOutput(
      { status: "needs_profile", missingFacts: ["unknown"] },
      { objective: "trust", requestText: "需要商家资料", merchantProjectName: "测试商家", merchantProfileText: "主营甜品" }
    ),
    CustomScriptValidationError
  );
});

test("enforces the internal length range, non-speech, forbidden wording and fact safety", () => {
  const script = compliantScript();
  const validated = validateCustomScriptDomainOutput(
    { status: "success", finalScript: script },
    { objective: "trust", requestText: "写下午茶", merchantProjectName: "测试商家", merchantProfileText: "主营甜品，服务附近上班族下午茶。" }
  );
  assert.equal(validated.status, "success");
  for (const invalid of [
    script.replace("附近上班族", "# 附近上班族"),
    script.replace("附近上班族", "家人们谁懂啊"),
    script.replace("附近上班族", "刷完当天能住"),
    script.replace("附近上班族", "只要30元")
  ]) {
    assert.throws(
      () => validateCustomScriptDomainOutput(
        { status: "success", finalScript: invalid },
        { objective: "trust", requestText: "写下午茶", merchantProjectName: "测试商家", merchantProfileText: "主营甜品，服务附近上班族下午茶。" }
      ),
      CustomScriptValidationError
    );
  }
});

test("rejects punctuation-only output even when its length is valid", () => {
  assert.throws(
    () => validateCustomScriptDomainOutput(
      { status: "success", finalScript: "。".repeat(200) },
      { objective: "trust", requestText: "写下午茶", merchantProjectName: "测试商家", merchantProfileText: "主营甜品" }
    ),
    (error: unknown) => error instanceof CustomScriptValidationError
      && error.reason === "non_speech_content"
  );
});

test("rejects title, storyboard, and timeline labels as non-speech structure", () => {
  const context = { objective: "trust" as const, requestText: "写下午茶", merchantProjectName: "测试商家", merchantProfileText: "主营甜品" };
  for (const label of ["标题：", "分镜：", "时间轴："]) {
    assert.throws(
      () => validateCustomScriptDomainOutput(
        { status: "success", finalScript: exactLengthScript(240).replace("附近上班族下午茶", `${label}附近上班族下午茶`) },
        context
      ),
      (error: unknown) => error instanceof CustomScriptValidationError
        && error.reason === "list_or_heading"
    );
  }
});

test("accepts flexible natural speech layouts inside the user-facing target range", () => {
  const context = { objective: "trust" as const, requestText: "写下午茶", merchantProjectName: "测试商家", merchantProfileText: "主营甜品" };
  const scripts = [
    exactLengthScript(240).replace(/\n/gu, ""),
    `${"近".repeat(120)}\n${"店".repeat(119)}。`,
    `${"真".repeat(239)}。`
  ];

  for (const finalScript of scripts) {
    const result = validateCustomScriptDomainOutput(
      { status: "success", finalScript },
      context
    );
    assert.equal(result.status, "success");
  }
});

test("length validation accepts the 80-350 safety band and returns typed repair buckets", () => {
  const context = { objective: "trust" as const, requestText: "写下午茶", merchantProjectName: "测试商家", merchantProfileText: "主营甜品" };

  for (const count of [80, 150, 199, 200, 350]) {
    const finalScript = exactLengthScript(count);
    assert.notEqual(finalScript.split("\n").length, 15);
    const result = validateCustomScriptDomainOutput(
      { status: "success", finalScript },
      context
    );
    assert.equal(result.status, "success");
  }

  const cases = [
    [79, "short", "under_80"],
    [351, "long", "351_360"],
    [360, "long", "351_360"],
    [361, "long", "over_360"]
  ] as const;

  for (const [actualCount, direction, lengthBucket] of cases) {
    assert.throws(
      () => validateCustomScriptDomainOutput(
        { status: "success", finalScript: exactLengthScript(actualCount) },
        context
      ),
      (error: unknown) => error instanceof CustomScriptValidationError
        && error.reason === "length"
        && error.repairContext?.actualCount === actualCount
        && error.repairContext.direction === direction
        && error.repairContext.lengthBucket === lengthBucket
    );
  }

  assert.throws(
    () => validateCustomScriptDomainOutput(
      { status: "success", finalScript: 42 },
      context
    ),
    (error: unknown) => error instanceof CustomScriptValidationError
      && error.reason === "shape"
      && error.repairContext === undefined
  );
});

test("line-count diagnostics use only non-exact safe range buckets", () => {
  const cases = [
    [0, "under_5"],
    [4, "under_5"],
    [5, "5_9"],
    [9, "5_9"],
    [10, "10_14"],
    [14, "10_14"],
    [15, "15_20"],
    [20, "15_20"],
    [21, "21_30"],
    [30, "21_30"],
    [31, "over_30"]
  ] as const;
  for (const [lineCount, bucket] of cases) {
    assert.equal(createCustomScriptLineCountBucket(lineCount), bucket);
  }
});

test("regeneration rejects duplicate script and matching opening", () => {
  const script = compliantScript();
  assert.throws(
    () => validateCustomScriptDomainOutput(
      { status: "success", finalScript: script },
      { objective: "trust", requestText: "换一版", merchantProjectName: "测试商家", merchantProfileText: "主营甜品", previousScript: script }
    ),
    CustomScriptValidationError
  );
});

test("numeric facts require an exact value and adjacent unit match", () => {
  assert.deepEqual(
    extractCustomScriptNumericFactTokens("价格30元，优惠85%，持续7天，长度2米，温度26℃"),
    ["30元", "85%", "7天", "2米", "26℃"]
  );
  const priceScript = compliantScript().replace("附近上班族", "价格30元");
  for (const [replacement, merchantProfileText] of [
    ["价格30元", "下午茶价格30元"],
    ["优惠85%", "会员优惠85%"],
    ["持续7天啦", "活动持续7天"],
    ["温度26℃", "保存温度26℃"]
  ]) {
    assert.equal(validateCustomScriptDomainOutput(
      { status: "success", finalScript: compliantScript().replace("附近上班族", replacement) },
      { objective: "trust", requestText: "写下午茶", merchantProjectName: "测试商家", merchantProfileText }
    ).status, "success");
  }
  for (const merchantProfileText of ["下午茶价格130元", "制作时间30分钟"]) {
    assert.throws(() => validateCustomScriptDomainOutput(
      { status: "success", finalScript: priceScript },
      { objective: "trust", requestText: "写下午茶", merchantProjectName: "测试商家", merchantProfileText }
    ), (error: unknown) => error instanceof CustomScriptValidationError && error.reason === "fact_safety");
  }
});

test("diagnostic claims require medical uncertainty instead of asserting a condition", () => {
  const context = {
    objective: "trust" as const,
    requestText: "写护肤口播，必要时建议咨询医生",
    merchantProfileText: "主营基础皮肤护理",
    merchantProjectName: "轻颜皮肤管理中心"
  };
  for (const diagnosis of [
    "这是玫瑰痤疮",
    "确定是皮炎",
    "肯定是湿疹",
    "已经确诊为皮炎",
    "诊断为湿疹",
    "这些表现说明感染",
    "这说明皮肤屏障受损",
    "其实是皮肤屏障受损了",
    "这不是玫瑰痤疮，而是普通敏感",
    "你的情况更像玫瑰痤疮，建议咨询医生",
    "怎么判断是不是皮炎，其实就是湿疹",
    "其实就是湿疹，怎么判断是不是皮炎"
  ]) {
    assert.throws(
      () => validateCustomScriptDomainOutput(
        { status: "success", finalScript: compliantScript().replace("附近上班族选下午茶别只看外表", diagnosis) },
        context
      ),
      (error: unknown) => error instanceof CustomScriptValidationError && error.reason === "fact_safety"
    );
  }

  for (const cautious of [
    "这是关于湿疹的日常护理科普",
    "这说明要避免皮肤感染",
    "怎么判断是不是皮炎",
    "如何判断是否可能是湿疹",
    "怎样区分皮炎和普通刺激",
    "这是皮炎吗",
    "这些表现可能与刺激有关，建议咨询医生"
  ]) {
    assert.equal(validateCustomScriptDomainOutput(
      { status: "success", finalScript: compliantScript().replace("附近上班族选下午茶别只看外表", cautious) },
      context
    ).status, "success");
  }
});

test("medical referrals are not marketing CTAs, but merchant consultation remains blocked", () => {
  const context = {
    objective: "trust" as const,
    requestText: "写护肤科普口播",
    merchantProjectName: "轻颜皮肤管理中心",
    merchantProfileText: "主营基础皮肤护理"
  };
  for (const referral of [
    "这些表现可能是皮炎，建议咨询医生",
    "这些表现可能是皮炎，可以咨询专业医生",
    "这些表现可能是皮炎，建议咨询医师",
    "这些表现可能是皮炎，建议咨询皮肤科",
    "这些表现可能是皮炎，建议及时就医"
  ]) {
    assert.equal(validateCustomScriptDomainOutput(
      { status: "success", finalScript: compliantScript().replace("附近上班族选下午茶别只看外表", referral) },
      context
    ).status, "success");
  }

  for (const marketingCta of ["欢迎咨询我们", "可以咨询门店", "欢迎到店咨询"]) {
    assert.throws(
      () => validateCustomScriptDomainOutput(
        { status: "success", finalScript: compliantScript().replace("附近上班族选下午茶别只看外表", marketingCta) },
        context
      ),
      (error: unknown) => error instanceof CustomScriptValidationError && error.reason === "cta"
    );
  }
});

test("merchant high-risk capability claims must be supported by the selected profile", () => {
  for (const claim of [
    "店内配备进口美容仪",
    "咱们店用的是进口美容仪",
    "轻颜配备进口美容仪",
    "我们店有进口美容仪",
    "我们店有一台进口美容仪",
    "我们店配有进口美容仪"
  ]) {
    const unsupported = compliantScript().replace("附近上班族选下午茶别只看外表", claim);
    assert.throws(
      () => validateCustomScriptDomainOutput(
        { status: "success", finalScript: unsupported },
        {
          objective: "trust",
          requestText: "写护肤口播",
          merchantProfileText: "主营基础皮肤护理",
          merchantProjectName: "轻颜皮肤管理中心"
        }
      ),
      (error: unknown) => error instanceof CustomScriptValidationError && error.reason === "fact_safety"
    );
  }
  const supported = compliantScript().replace(
    "附近上班族选下午茶别只看外表",
    "我们店使用进口美容仪"
  );
  assert.equal(validateCustomScriptDomainOutput(
    { status: "success", finalScript: supported },
    {
      objective: "trust",
      requestText: "写护肤口播",
      merchantProfileText: "本店使用进口美容仪，主营基础皮肤护理",
      merchantProjectName: "轻颜皮肤管理中心"
    }
  ).status, "success");

  const generalKnowledge = compliantScript().replace(
    "附近上班族选下午茶别只看外表",
    "选进口美容仪也要先看自身需求"
  );
  assert.equal(validateCustomScriptDomainOutput(
    { status: "success", finalScript: generalKnowledge },
    {
      objective: "trust",
      requestText: "写护肤口播",
      merchantProfileText: "主营基础皮肤护理",
      merchantProjectName: "轻颜皮肤管理中心"
    }
  ).status, "success");

  const capabilityQuestion = compliantScript().replace(
    "附近上班族选下午茶别只看外表",
    "我们店经常有人问美容仪怎么选"
  );
  assert.equal(validateCustomScriptDomainOutput(
    { status: "success", finalScript: capabilityQuestion },
    {
      objective: "trust",
      requestText: "写护肤口播",
      merchantProfileText: "主营基础皮肤护理",
      merchantProjectName: "轻颜皮肤管理中心"
    }
  ).status, "success");

  const customerQuestion = compliantScript().replace(
    "附近上班族选下午茶别只看外表",
    "我们店有不少顾客问美容仪怎么选"
  );
  assert.equal(validateCustomScriptDomainOutput(
    { status: "success", finalScript: customerQuestion },
    {
      objective: "trust",
      requestText: "写护肤口播",
      merchantProfileText: "主营基础皮肤护理",
      merchantProjectName: "轻颜皮肤管理中心"
    }
  ).status, "success");

  for (const negativeCapability of [
    "我们店没有使用进口美容仪",
    "我们店未配备进口美容仪"
  ]) {
    assert.equal(validateCustomScriptDomainOutput(
      {
        status: "success",
        finalScript: compliantScript().replace("附近上班族选下午茶别只看外表", negativeCapability)
      },
      {
        objective: "trust",
        requestText: "写护肤口播",
        merchantProfileText: "主营基础皮肤护理",
        merchantProjectName: "轻颜皮肤管理中心"
      }
    ).status, "success");
  }

  const factBeforeCapabilityVerb = compliantScript().replace(
    "附近上班族选下午茶别只看外表",
    "我们店常有人问进口美容仪怎么选，使用前先了解需求"
  );
  assert.equal(validateCustomScriptDomainOutput(
    { status: "success", finalScript: factBeforeCapabilityVerb },
    {
      objective: "trust",
      requestText: "写护肤口播",
      merchantProfileText: "主营基础皮肤护理",
      merchantProjectName: "轻颜皮肤管理中心"
    }
  ).status, "success");
});

test("regeneration rejects high body reuse but accepts a substantive rewrite", () => {
  const previousScript = compliantScript();
  const onlyOpeningChanged = ["上班族选下午茶先别只看外表。", ...previousScript.split("\n").slice(1)].join("\n");
  const rewritten = compliantScript("上班族挑下午茶先问当天安排。");
  assert.throws(() => validateCustomScriptDomainOutput(
    { status: "success", finalScript: previousScript },
    { objective: "trust", requestText: "换一版", merchantProjectName: "测试商家", merchantProfileText: "主营下午茶，服务附近上班族", previousScript }
  ), CustomScriptValidationError);
  assert.throws(() => validateCustomScriptDomainOutput(
    { status: "success", finalScript: onlyOpeningChanged },
    { objective: "trust", requestText: "换一版", merchantProjectName: "测试商家", merchantProfileText: "主营下午茶，服务附近上班族", previousScript }
  ), (error: unknown) => error instanceof CustomScriptValidationError && error.reason === "duplicate_body");
  assert.equal(validateCustomScriptDomainOutput(
    { status: "success", finalScript: rewritten },
    { objective: "trust", requestText: "换一版", merchantProjectName: "测试商家", merchantProfileText: "主营下午茶，服务附近上班族", previousScript }
  ).status, "success");
});

test("regeneration rejects a lightly edited duplicate in a single paragraph", () => {
  const previousScript = `${"真".repeat(239)}。`;
  const lightlyEdited = `${"真".repeat(238)}实。`;
  assert.throws(
    () => validateCustomScriptDomainOutput(
      { status: "success", finalScript: lightlyEdited },
      { objective: "trust", requestText: "换一版", merchantProjectName: "测试商家", merchantProfileText: "主营甜品", previousScript }
    ),
    (error: unknown) => error instanceof CustomScriptValidationError
      && error.reason === "duplicate_body"
  );
});

test("prompt keeps the stable security-profile-rules-request order without reading markdown", () => {
  const messages = buildCustomScriptMessages({
    merchantProjectName: "测试商家",
    merchantProfileText: "主营甜品",
    requestText: "写下午茶",
    objective: "traffic",
    tone: "natural"
  });
  assert.equal(messages.length, 4);
  assert.match(messages[0].content, /安全|JSON/);
  assert.match(messages[1].content, /主营甜品/);
  assert.match(messages[2].content, /240.*300/);
  assert.match(messages[2].content, /200.*350/);
  assert.match(messages[2].content, /Unicode White_Space/);
  assert.match(messages[2].content, /汉字.*数字.*字母.*标点.*各计1/u);
  assert.doesNotMatch(messages[2].content, /15个非空行/u);
  assert.doesNotMatch(messages[2].content, /每行.*19—20/u);
  assert.match(messages[2].content, /自由分段或换行/u);
  assert.doesNotMatch(messages[2].content, /一句一行|每个非空行只含一句|不超过25|超过25/u);
  assert.match(messages[2].content, /自检/);
  assert.doesNotMatch(messages.map((item) => item.content).join("\n"), /charCount/u);
  for (const code of MISSING_FACT_CODES) {
    assert.equal(messages[0].content.split(code).length - 1, 1, `${code} must appear exactly once`);
  }
  assert.match(messages[0].content, /1—5/);
  assert.match(messages[3].content, /写下午茶/);
  assert.doesNotMatch(messages.map((item) => item.content).join("\n"), /口播脚本写作方法\.md|32KB/);
});
