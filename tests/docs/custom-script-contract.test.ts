import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

const missingFactMappings = [
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
  ["warranty_or_after_sales", "质保或售后"],
] as const;

test("custom script writing rules preserve format and fact boundaries", () => {
  const rules = readProjectFile("docs/CUSTOM_SCRIPT_WRITING_RULES.md");

  assert.match(rules, /200—350/);
  assert.match(rules, /80—350/);
  assert.match(rules, /240—300/);
  assert.match(rules, /under_80/);
  assert.match(rules, /不得暴露80底线/);
  assert.match(rules, /不得为凑字编造事实/);
  assert.match(rules, /只移除 Unicode `White_Space`/);
  assert.match(rules, /按 Unicode code points 计数/);
  assert.match(rules, /自然口播排版/);
  assert.match(rules, /同一段可以包含多句/);
  assert.match(rules, /一句话也可以跨行/);
  assert.match(rules, /不限制单句长度/);
  assert.match(rules, /至少包含一个 Unicode 字母或数字/);
  assert.doesNotMatch(rules, /一句一行|终止标点不得在行内提前出现|最多25个 code points/u);
  assert.doesNotMatch(rules, /满足\s*200—350\s*字、短句/u);
  assert.match(rules, /自由分段或使用长句，排版不作为拒绝原因/u);
  assert.doesNotMatch(rules, /恰好15个非空行/);
  assert.match(rules, /唯一商业事实来源/);
  assert.match(rules, /仅当目标为 `conversion`，或用户明确要求/);
  assert.match(rules, /内容承诺与互动动作都只有用户明确要求/);
  assert.match(rules, /`missingFacts` 必须为1—5个/);
  assert.match(rules, /固定缺失资料码与前端本地中文映射/);
  for (const code of [
    "main_product",
    "core_selling_point",
    "target_audience",
    "consumption_scene",
    "price",
    "promotion",
    "address_or_service_area",
    "service_process",
    "qualification",
    "proof_or_case",
    "effect_claim",
  ]) {
    assert.ok(rules.includes(`\`${code}\``));
  }
  assert.match(rules, /AI 不得返回自由文本/);
  assert.match(rules, /服务端必须对固定码做白名单校验/);
  assert.match(rules, /不得把“E0 级”改写成“刷完当天能住”/);
  assert.match(rules, /不得把某项美甲工艺改写成“多撑两周”/);
  assert.match(rules, /不得凭空写“进店先倒热茶”/);
  assert.match(rules, /不宣称它们必然造成任何平台限流/);
  assert.match(rules, /低风险通用行业知识/);
  assert.match(rules, /原因解释/);
  assert.match(rules, /判断标准/);
  assert.match(rules, /可执行方法/);
  assert.match(rules, /适用边界或风险提醒/);
  assert.match(rules, /至少包含其中两类/);
  assert.match(rules, /不得把通用知识写成当前商家事实/);
  assert.match(rules, /不得生成医疗诊断、治疗方案、处方或效果保证/);
  assert.match(rules, /不得编造精确标准、技术参数或无依据数字/);
  assert.match(rules, /运行时只使用压缩规则和短小的去标识化示例/);
});

test("custom script product, API, and AI documents share one contract", () => {
  const design = readProjectFile("docs/CUSTOM_SCRIPT_DESIGN_SPEC.md");
  const prd = readProjectFile("docs/PRD.md");
  const api = readProjectFile("docs/API_SPEC.md");
  const ai = readProjectFile("docs/AI_WORKFLOW.md");
  const memory = readProjectFile("MEMORY.md");

  for (const document of [design, prd, api, ai, memory]) {
    assert.match(document, /200—350/);
    assert.match(document, /80—350/);
    assert.match(document, /deepseek-v4-flash/);
  }

  for (const document of [design, prd, api, ai, memory]) {
    assert.doesNotMatch(document, /5次全部在8秒内/);
    assert.doesNotMatch(document, /全部不超过8秒才同步/);
    assert.doesNotMatch(document, /同步\/异步决策门槛/);
  }

  assert.match(design, /固定使用 `CustomScriptGenerationJob` 与独立单副本 Worker/);
  assert.doesNotMatch(design, /5 次全部在 8 秒内/);
  assert.doesNotMatch(design, /任意一次超过 8 秒/);
  assert.match(design, /sourceProjectId: <项目ID>/);
  assert.match(design, /sourceType: <topic\|top_pick>/);
  assert.match(design, /sourceObjective: <auto\|traffic\|trust\|conversion>/);
  assert.match(design, /CR、LF、U\+2028、U\+2029/);
  assert.match(design, /连续 Unicode whitespace 收敛为单个 ASCII 空格并 trim/);
  assert.match(design, /项目名称只供用户辨认，不能用于安全判断/);
  assert.match(design, /从 `requestText` 独立解析官方头/);
  assert.match(design, /逐项交叉核对/);
  assert.match(design, /Top 3 来源目标只认机器字段 `sourceObjective`/);
  assert.match(design, /只用于验证来源并初始化界面；[^\n]*用户随后可以修改实际生成字段 `objective`/);
  assert.match(design, /不得要求 `objective === sourceObjective`/);
  assert.match(design, /正文从第六行开始/);
  for (const document of [design, prd, api, ai, memory]) {
    assert.match(document, /首个非空行/);
    assert.match(document, /FEFF/);
  }
  for (const document of [design, prd, api, ai, memory]) {
    assert.match(document, /lib\/custom-scripts\/text\.ts/);
  }
  assert.match(design, /结果仅临时保留30分钟且不进入历史，请及时复制/);
  assert.match(api, /POST \/api\/scripts\/generate-custom/);
  assert.match(api, /GET \/api\/scripts\/generate-custom\/:jobId/);
  assert.match(api, /GET \/api\/scripts\/generate-custom\/current/);
  assert.doesNotMatch(api, /GET \/api\/scripts\/generate-custom\/active/);
  assert.match(api, /DELETE \/api\/scripts\/generate-custom\/:jobId/);
  assert.match(api, /clientRequestId/);
  assert.match(api, /"sourceProjectId"/);
  assert.match(api, /"sourceType"/);
  assert.match(api, /"sourceObjective"/);
  assert.match(api, /用户实际选择的 `objective` 可以不同/);
  assert.match(api, /不得要求二者相等/);
  assert.match(api, /不存在、不属于当前用户或不等于 `projectId`/);
  assert.match(api, /字段空、缺、重复、非法、顺序错误/);
  assert.match(api, /CUSTOM_SCRIPT_PROJECT_SOURCE_MISMATCH/);
  assert.match(api, /CUSTOM_SCRIPT_IDEMPOTENCY_CONFLICT/);
  assert.match(api, /CUSTOM_SCRIPT_HOURLY_LIMIT_REACHED/);
  assert.match(api, /CustomScriptGenerationJob 持久契约/);
  assert.match(api, /`inputHash`/);
  assert.match(api, /runDeadlineAt = createdAt \+ 120s/);
  assert.match(api, /expiresAt = finishedAt \+ 30min/);
  assert.match(api, /立即清空所有输入字段/);
  assert.match(api, /绝不写入 Job/);
  assert.match(api, /同一个 Serializable 事务重新检查每日额度并提交/);
  assert.match(api, /每用户每小时10次限制/);
  assert.match(api, /`needs_profile`、失败和超时仍计小时次数/);
  assert.match(api, /maxAttempts=1/);
  assert.match(api, /总 Provider 调用最多2次/);
  assert.match(api, /`JSON.stringify` 或等价安全 JSON 序列化/);
  assert.match(api, /5—5000 Unicode code points/);
  assert.match(api, /最多1000 Unicode code points/);
  assert.match(api, /最多64 Unicode code points/);
  assert.match(api, /1—5个互不重复的固定缺失资料码/);
  assert.match(ai, /显式关闭思考模式/);
  assert.match(ai, /不读取外部 Markdown/);
  assert.match(ai, /关闭 envelope retry/);
  assert.match(ai, /固定使用持久 `CustomScriptGenerationJob` 与独立 Worker/);
  assert.match(prd, /固定五行头/);
  assert.match(prd, /正文从第六行开始/);
  assert.match(prd, /结果仅临时保留30分钟且不进入历史，请及时复制/);
  assert.match(prd, /同 UUID 同 payload 返回原任务/);
  assert.match(memory, /不再保留同步架构分支/);

  for (const document of [design, memory]) {
    assert.match(document, /quality_enrichment/);
    assert.match(document, /80—199/);
    assert.match(document, /首次安全稿/);
    assert.match(document, /Provider 失败/);
    assert.match(document, /非法输出/);
    assert.match(document, /needs_profile/);
    assert.match(document, /更差/);
    assert.match(document, /只扣一次额度/);
  }
});

test("custom script official header and async invariants are exact", () => {
  const design = readProjectFile("docs/CUSTOM_SCRIPT_DESIGN_SPEC.md");
  const api = readProjectFile("docs/API_SPEC.md");
  const officialHeader = [
    "【脚本工坊爆款选题】",
    "sourceProjectId: <项目ID>",
    "sourceType: <topic|top_pick>",
    "sourceObjective: <auto|traffic|trust|conversion>",
    "商家项目：<项目名称>",
  ].join("\n");

  assert.ok(design.includes(officialHeader));
  assert.ok(api.includes(officialHeader));
  assert.doesNotMatch(officialHeader, /^objective:/m);

  const exactAsyncInvariants = [
    "`runDeadlineAt = createdAt + 120s`",
    "`expiresAt = finishedAt + 30min`",
    "立即清空所有输入字段",
    "绝不写入 Job",
    "同一个 Serializable 事务重新检查每日额度并提交",
    "每用户每小时10次限制",
    "`needs_profile`、失败和超时仍计小时次数",
    "`maxAttempts=1`",
    "总 Provider 调用最多2次",
  ];

  for (const invariant of exactAsyncInvariants) {
    assert.ok(api.includes(invariant), `missing async invariant: ${invariant}`);
  }
});

test("custom script quality fallback is durable, private, recoverable, and semantically narrow", () => {
  const design = readProjectFile("docs/superpowers/specs/2026-07-15-custom-script-content-quality-design.md");
  const implementationPlan = readProjectFile("docs/superpowers/plans/2026-07-15-custom-script-content-quality.md");
  const productDesign = readProjectFile("docs/CUSTOM_SCRIPT_DESIGN_SPEC.md");
  const api = readProjectFile("docs/API_SPEC.md");
  const ai = readProjectFile("docs/AI_WORKFLOW.md");
  const testPlan = readProjectFile("docs/TEST_PLAN.md");
  const memory = readProjectFile("MEMORY.md");

  for (const document of [design, implementationPlan, productDesign, api, ai, testPlan, memory]) {
    assert.match(document, /quality_fallback/);
    assert.match(document, /CustomScriptGenerationJob\.result/);
    assert.match(document, /processing/);
    assert.match(document, /30秒.*租约恢复窗口|30-second.*lease recovery window/iu);
    assert.match(document, /5秒.*成功事务|5-second.*success transaction/iu);
    assert.match(document, /40秒.*总预留|40-second.*total reserve/iu);
    assert.match(document, /诊断|diagnos/iu);
    assert.match(document, /商家.*高风险.*断言|high-risk merchant assertions/iu);
    assert.match(document, /项目名称|project name/iu);
    assert.match(document, /能力动词|capability assertion verb/iu);
    assert.ok(document.endsWith("\n"));
  }

  for (const document of [api, ai, testPlan]) {
    assert.doesNotMatch(document, /80—199[^。\n]*(?:直接|立即)成功/u);
    assert.match(document, /processing[^。\n]*不得返回[^。\n]*正文/u);
  }

  assert.doesNotMatch(design, /只在 Worker 内存|only in Worker memory/i);
  assert.doesNotMatch(implementationPlan, /in-memory quality-enrichment decision/i);
  assert.match(testPlan, /首稿持久化后、第二次Provider预留前/u);
  assert.match(testPlan, /第二次Provider预留后/u);
  assert.match(testPlan, /并发取消/u);
  assert.match(testPlan, /这不是玫瑰痤疮，而是普通敏感/u);
  assert.match(testPlan, /确定是皮炎/u);
  assert.match(testPlan, /怎么判断是不是皮炎/u);
  assert.match(testPlan, /怎么判断是不是皮炎，其实就是湿疹/u);
  assert.match(api, /问句豁免只作用于当前病名所在分句/u);
  assert.match(testPlan, /咨询我们/u);
  assert.match(testPlan, /我们店有进口美容仪/u);
  assert.match(testPlan, /我们店有不少顾客问美容仪怎么选/u);
  assert.match(testPlan, /我们店没有使用进口美容仪/u);
  assert.match(testPlan, /我们店经常有人问美容仪怎么选/u);
  assert.match(api, /CTA计数前仅移除.*医生.*皮肤科.*就医/u);
  assert.match(api, /单字“有”.*最多间隔2字.*其他能力动词最多间隔6字/u);
  assert.doesNotMatch(ai, /Worker重启后[^。\n]*不能恢复上次正文/u);
});

test("custom script recovery, worker call limits, and quota guards are exact", () => {
  const design = readProjectFile("docs/CUSTOM_SCRIPT_DESIGN_SPEC.md");
  const api = readProjectFile("docs/API_SPEC.md");
  const ai = readProjectFile("docs/AI_WORKFLOW.md");
  const prd = readProjectFile("docs/PRD.md");

  for (const document of [design, api, ai, prd]) {
    assert.match(document, /\/api\/scripts\/generate-custom\/current/);
    assert.match(
      document,
      /queued\|processing\|succeeded\|needs_profile\|failed\|canceled/,
    );
  }
  assert.match(api, /按创建时间倒序取一条，不返回列表/);
  assert.match(api, /"success": true/);
  assert.match(api, /"data": null/);
  assert.match(api, /所有成功响应统一使用/);

  for (const document of [design, api, ai, prd]) {
    assert.match(document, /providerCallsStarted/);
    assert.match(document, /semanticAttempt/);
    assert.match(document, /30秒/);
    assert.match(document, /每10秒/);
    assert.match(document, /失锁[^。；\n]*Worker|Worker[^。；\n]*失锁/);
  }
  assert.match(api, /`providerCallsStarted=2`且fallback合法[^。\n]*不得调用第三次Provider/u);
  assert.match(api, /无合法fallback[^。\n]*失败/u);
  assert.match(api, /原子递增 `providerCallsStarted` 并写入对应 `semanticAttempt`/);
  assert.match(api, /新Worker重领[^。\n]*fallback/u);
  assert.match(api, /lock token\s*不匹配而失败/);

  for (const document of [design, api, ai]) {
    assert.match(document, /assertDailyScriptQuota/);
    assert.match(document, /再次检查每日额度|重新检查每日额度/);
  }
  assert.match(api, /并发定制任务或其他脚本功能/);
  assert.match(api, /失败、超时和取消不扣每日额度|失败、超时、取消和资料不足均不扣额|失败、超时、取消和 `needs_profile` 不扣每日额度/);
});

test("custom script empty content and provider failures have distinct error codes", () => {
  const design = readProjectFile("docs/CUSTOM_SCRIPT_DESIGN_SPEC.md");
  const api = readProjectFile("docs/API_SPEC.md");
  const ai = readProjectFile("docs/AI_WORKFLOW.md");
  const plan = readProjectFile("docs/TEST_PLAN.md");

  for (const document of [design, api, ai]) {
    assert.match(document, /连续两次 `empty_content`/);
    assert.match(document, /最终固定为 `CUSTOM_SCRIPT_OUTPUT_INVALID`/);
    assert.match(document, /只有网络错误、Provider 请求超时或 HTTP 失败/);
    assert.match(document, /`CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE`/);
    assert.match(document, /`CUSTOM_SCRIPT_RUN_TIMEOUT`/);
  }

  assert.match(
    plan,
    /CS-FAIL-01.*连续两次返回 `empty_content`.*最终 errorCode 固定为 `CUSTOM_SCRIPT_OUTPUT_INVALID`/,
  );
  assert.match(plan, /不得归类为 Provider 不可用/);
  assert.match(
    plan,
    /只有网络错误、Provider 请求超时或 HTTP 失败使用 `CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE`/,
  );
});

test("custom script worker crash and late-response recovery are independent cases", () => {
  const plan = readProjectFile("docs/TEST_PLAN.md");
  const crashStart = plan.indexOf("#### Case CS-WORKER-01");
  const lateStart = plan.indexOf("#### Case CS-WORKER-02");
  const nextSection = plan.indexOf("### 17.8", lateStart);

  assert.ok(crashStart >= 0);
  assert.ok(lateStart > crashStart);
  assert.ok(nextSection > lateStart);

  const crashCase = plan.slice(crashStart, lateStart);
  const lateCase = plan.slice(lateStart, nextSection);

  assert.match(crashCase, /强制终止 Worker A 进程/);
  assert.match(crashCase, /本 Case 不保留 Worker A 或模拟迟到响应/);
  assert.match(crashCase, /30秒 stale lock/);
  assert.match(crashCase, /沿用 `providerCallsStarted=1`/);
  assert.match(crashCase, /Provider 调用总数≤2/);
  assert.doesNotMatch(crashCase, /in-flight Provider 响应迟到返回/);

  assert.match(lateCase, /仅停止锁心跳，不终止进程/);
  assert.match(lateCase, /不取消仍在进行的 Provider 请求/);
  assert.match(lateCase, /in-flight Provider 响应迟到返回/);
  assert.match(lateCase, /lock token 与 `lockedBy`/);
  assert.match(lateCase, /更新0行/);
  assert.match(lateCase, /Provider 调用总数≤2/);
  assert.doesNotMatch(lateCase, /强制终止 Worker A 进程/);
});

test("custom script canonical hash, source parser, and cancellation are exact", () => {
  const design = readProjectFile("docs/CUSTOM_SCRIPT_DESIGN_SPEC.md");
  const api = readProjectFile("docs/API_SPEC.md");
  const ai = readProjectFile("docs/AI_WORKFLOW.md");
  const memory = readProjectFile("MEMORY.md");
  const canonicalPayload =
    "[projectId,requestText,objective,tone,previousScript||'',sourceProjectId||'',sourceType||'',sourceObjective||'']";

  for (const document of [design, api, ai]) {
    assert.match(document, /NFC/);
    assert.match(document, /CRLF\/CR→LF/);
    assert.ok(document.includes(canonicalPayload));
    assert.match(document, /SHA-256/);
    assert.match(document, /`clientRequestId` 不参与/);
  }

  for (const document of [design, api, ai, memory]) {
    assert.match(document, /U\+2028/);
    assert.match(document, /U\+2029/);
    assert.match(document, /连续 Unicode whitespace|连续Unicode whitespace/);
    assert.match(document, /保留机器字段/);
  }
  assert.match(api, /只能出现在正确五行头的对应位置/);
  assert.match(api, /全文完全不含官方标识和三个保留机器字段/);

  assert.match(api, /DELETE \/api\/scripts\/generate-custom\/:jobId/);
  assert.match(api, /取消与 Worker 完成竞争时只能有一个条件更新获胜/);
  assert.match(api, /同时清空输入、结果和 Worker 锁/);
  assert.match(design, /页面生成中必须显示“取消生成”/);
  assert.match(ai, /取消与完成只能有一个条件更新获胜/);
});

test("custom script missing facts enum is identical across contracts", () => {
  const design = readProjectFile("docs/CUSTOM_SCRIPT_DESIGN_SPEC.md");
  const rules = readProjectFile("docs/CUSTOM_SCRIPT_WRITING_RULES.md");
  const prd = readProjectFile("docs/PRD.md");
  const api = readProjectFile("docs/API_SPEC.md");
  const ai = readProjectFile("docs/AI_WORKFLOW.md");
  const memory = readProjectFile("MEMORY.md");
  const codes = missingFactMappings.map(([code]) => code);

  assert.equal(codes.length, 18);
  assert.equal(new Set(codes).size, 18);
  assert.equal(new Set(missingFactMappings.map(([, label]) => label)).size, 18);

  for (const document of [design, rules, prd, api, ai, memory]) {
    for (const code of codes) {
      assert.ok(document.includes(code), `missing fact code: ${code}`);
    }
    assert.match(document, /1—5/);
    assert.match(document, /18项|18个/);
    assert.match(document, /前端.*本地.*映射|前端本地映射/);
  }

  const exactCodeBlock = `\`\`\`text\n${codes.join("\n")}\n\`\`\``;
  assert.ok(api.includes(exactCodeBlock));

  for (const [code, label] of missingFactMappings) {
    assert.ok(rules.includes(`| \`${code}\` | ${label} |`));
    for (const document of [design, prd, api, ai, memory]) {
      assert.ok(
        document.includes(`\`${code}\`→${label}`),
        `missing mapping: ${code} -> ${label}`,
      );
    }
  }

  assert.match(rules, /模型只返回 code/);
  assert.match(api, /模型只返回 code/);
  assert.match(ai, /模型只返回 code/);
  assert.match(rules, /白名单校验/);
  assert.match(api, /白名单校验/);
});

test("custom script test plan is executable and covers every stage-one gate", () => {
  const plan = readProjectFile("docs/TEST_PLAN.md");
  const factRows = plan.match(/^\| CS-FACT-\d{2} \|.*$/gm) ?? [];

  assert.match(plan, /## 17\. V2 定制化脚本（规划中，仅 staging 验收）/);
  assert.match(plan, /只使用 staging 外部域名和隔离测试数据库/);
  for (const caseId of [
    "CS-REAL-01",
    "CS-REAL-02",
    "CS-REAL-03",
    "CS-REAL-04",
    "CS-REAL-05",
  ]) {
    assert.ok(plan.includes(caseId), `missing staging case: ${caseId}`);
  }

  assert.equal(factRows.length, 20);
  for (const [index, [code]] of missingFactMappings.entries()) {
    const caseId = `CS-FACT-${String(index + 1).padStart(2, "0")}`;
    const row = factRows.find((candidate) => candidate.includes(caseId));
    assert.ok(row?.includes(`\`${code}\``), `missing ${caseId} -> ${code}`);
    assert.ok(row?.includes("`needs_profile`"), `missing ${caseId} terminal state`);
  }
  assert.match(plan, /CS-FACT-19 \| 跨商家污染/);
  assert.match(plan, /CS-FACT-19.*`success`/);
  assert.match(plan, /CS-FACT-20 \| 方法论案例与行业结论/);
  assert.match(plan, /CS-FACT-20.*拒绝模型输出/);
  assert.match(plan, /20组明确覆盖 `needs_profile`、`success` 和拒绝模型输出三种结果/);
  assert.match(plan, /均不得出现虚构价格、活动、地址、资质、功效、服务动作、经营数据或效果保证/);

  for (const requirement of [
    "CS-AUTH-01",
    "CS-AUTH-02",
    "CS-SOURCE-02",
    "相同展示名但不同 ID",
    "重命名 A1",
    "全文完全不含官方标识和三个保留字段",
    "Unicode code points",
    "80、150、199、200和350接受",
    "自然段落或换行均可",
    "1280/1440",
    "375/390",
    "仅键盘",
    "prefers-reduced-motion: reduce",
    "CS-IDEMP-01",
    "CS-IDEMP-02",
    "CUSTOM_SCRIPT_ALREADY_RUNNING",
    "assertDailyScriptQuota",
    "Serializable 事务重检",
    "CS-HOURLY-01",
    "providerCallsStarted=2",
    "每10秒心跳",
    "六状态刷新",
    "30分钟",
    "CS-CANCEL-02",
    "empty_content",
    "非法 JSON",
    "needs_profile",
    "npm test",
    "npm run lint",
    "npm run typecheck",
    "npm run build",
    "不得推生产",
  ]) {
    assert.ok(plan.includes(requirement), `missing test-plan gate: ${requirement}`);
  }

  for (const status of [
    "queued",
    "processing",
    "succeeded",
    "needs_profile",
    "failed",
    "canceled",
  ]) {
    assert.ok(plan.includes(`\`${status}\``), `missing recoverable status: ${status}`);
  }
});

test("custom script Unicode output algorithm is identical in writing and API contracts", () => {
  const rules = readProjectFile("docs/CUSTOM_SCRIPT_WRITING_RULES.md");
  const api = readProjectFile("docs/API_SPEC.md");
  const algorithmParts = [
    "lib/custom-scripts/text.ts",
    "NFC",
    "White_Space",
    "内部 FEFF 不移除并计1",
    "按 Unicode code points 计数",
    "中文、英文、数字和标点各计1",
    "200—350",
    "80—350",
  ];

  for (const part of algorithmParts) {
    assert.ok(rules.includes(part), `writing rules missing algorithm part: ${part}`);
    assert.ok(api.includes(part), `API contract missing algorithm part: ${part}`);
  }
  for (const document of [rules, api]) {
    assert.match(document, /Unicode 字母或数字/);
    assert.doesNotMatch(document, /一句一行|每个非空行只含一句|单句最多25/u);
  }
});

test("formal custom-script operations docs contain no legacy expansion contract", () => {
  const plan = readProjectFile("docs/TEST_PLAN.md");
  const ai = readProjectFile("docs/AI_WORKFLOW.md");
  const deployment = readProjectFile("docs/DEPLOYMENT_CHECKLIST.md");
  const formalPlan = plan.split("## 22. Staging 24句数组隔离探针")[0];
  const formalAi = ai.split("### Staging 24句数组隔离探针")[0];

  assert.match(formalPlan, /80—350内部安全范围/);
  assert.match(formalPlan, /under_80/);
  assert.match(formalPlan, /Prompt目标240—300/);
  assert.match(formalPlan, /合法首轮[^\n]*1次Provider/u);
  assert.doesNotMatch(formalPlan, /逐行格式|句式错误/u);
  assert.match(formalPlan, /单句长度和句末标点不作为拒绝原因/u);
  assert.doesNotMatch(formalPlan, /260→290|320→290|260→279|15行可计算写作骨架|安全短稿原地扩写/u);
  assert.doesNotMatch(formalAi, /validatedDraft|原地扩写/u);
  assert.doesNotMatch(formalAi, /逐行格式/u);
  assert.match(formalAi, /单句长度和句末标点不作为拒绝原因/u);
  assert.match(deployment, /每条成功结果必须处于80—350内部安全范围/);
  assert.match(deployment, /页面创作目标约200—350字/);
  assert.match(deployment, /合规结果[^\n]*单次Provider/u);

  const isolatedProbeDocs = `${plan.slice(formalPlan.length)}\n${ai.slice(formalAi.length)}`;
  assert.match(isolatedProbeDocs, /隔离[^\n]*280—300/u);
});

test("deployment examples do not regress to the legacy DeepSeek model", () => {
  const activeDeploymentGuides = [
    "STAGING_DEPLOY_MANUAL.md",
    "docs/EDGEONE_SETUP_GUIDE.md",
    "docs/EDGEONE_DJYYING_ASIA_SETUP.md",
    "docs/EDGEONE_DIYYIING_ASIA_SETUP.md",
  ];

  for (const path of activeDeploymentGuides) {
    const document = readProjectFile(path);
    assert.doesNotMatch(document, /DEEPSEEK_MODEL=deepseek-chat/);
    assert.match(document, /DEEPSEEK_MODEL=deepseek-v4-flash/);
  }
});
