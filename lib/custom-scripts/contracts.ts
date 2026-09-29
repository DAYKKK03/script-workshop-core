import { createHash } from "node:crypto";
import {
  countCustomScriptCodePoints,
  countNormalizedCustomScriptCodePoints,
  isCustomScriptWhitespaceOnly,
  normalizeCustomScriptLineEndings,
  normalizeCustomScriptText
} from "@/lib/custom-scripts/text";
import {
  MISSING_FACT_CODES,
  type MissingFactCode
} from "@/lib/custom-scripts/missing-facts";
import {
  CUSTOM_SCRIPT_MAX_CODE_POINTS,
  CUSTOM_SCRIPT_MIN_CODE_POINTS,
  createCustomScriptLengthRepairContext,
  type CustomScriptLengthRepairContext,
  type CustomScriptValidationReason,
  type NonLengthValidationReason
} from "@/lib/custom-scripts/length-repair";

export { MISSING_FACT_CODES, type MissingFactCode } from "@/lib/custom-scripts/missing-facts";
export {
  CUSTOM_SCRIPT_LINE_COUNT_BUCKETS,
  CUSTOM_SCRIPT_LENGTH_BUCKETS,
  CUSTOM_SCRIPT_MAX_CODE_POINTS,
  CUSTOM_SCRIPT_MIN_CODE_POINTS,
  CUSTOM_SCRIPT_PRODUCT_TARGET_MIN_CODE_POINTS,
  CUSTOM_SCRIPT_TARGET_MAX_CODE_POINTS,
  CUSTOM_SCRIPT_TARGET_MIN_CODE_POINTS,
  createCustomScriptLineCountBucket,
  shouldAttemptCustomScriptQualityEnrichment,
  shouldUseCustomScriptQualityCandidate,
  type CustomScriptLineCountBucket,
  type CustomScriptLengthBucket,
  type CustomScriptLengthDirection,
  type CustomScriptLengthRepairContext,
  type CustomScriptRepair,
  type CustomScriptValidationRepair,
  type CustomScriptValidationReason
} from "@/lib/custom-scripts/length-repair";

export const CUSTOM_SCRIPT_OBJECTIVES = ["auto", "traffic", "trust", "conversion"] as const;
export const CUSTOM_SCRIPT_TONES = ["auto", "natural", "professional", "emotional"] as const;
export const CUSTOM_SCRIPT_SOURCE_TYPES = ["topic", "top_pick"] as const;

export type CustomScriptObjective = (typeof CUSTOM_SCRIPT_OBJECTIVES)[number];
export type CustomScriptTone = (typeof CUSTOM_SCRIPT_TONES)[number];
export type CustomScriptSourceType = (typeof CUSTOM_SCRIPT_SOURCE_TYPES)[number];
export type CustomScriptInputType = "brief" | CustomScriptSourceType;

export type ValidatedCustomScriptInput = {
  clientRequestId: string;
  projectId: string;
  requestText: string;
  objective: CustomScriptObjective;
  tone: CustomScriptTone;
  previousScript?: string;
  sourceProjectId?: string;
  sourceType?: CustomScriptSourceType;
  sourceObjective?: CustomScriptObjective;
  inputType: CustomScriptInputType;
};

export type CustomScriptDomainResult =
  | { status: "success"; finalScript: string }
  | { status: "needs_profile"; missingFacts: MissingFactCode[] };

export type CustomScriptValidationContext = {
  objective: CustomScriptObjective;
  requestText: string;
  merchantProjectName: string;
  merchantProfileText: string;
  previousScript?: string;
};

const officialHeader = "【脚本工坊爆款选题】";
const reservedPrefixes = ["sourceProjectId:", "sourceType:", "sourceObjective:"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbiddenPhrases = [
  "保证有效", "百分百满意", "包治包好", "全网第一", "行业领先", "无人能比", "史上最",
  "家人们谁懂啊", "绝绝子", "yyds", "闭眼冲", "错过再等一年", "最后一天", "仅此一次",
  "求点赞", "求关注", "帮忙转发", "三连走起", "观众朋友们", "各位网友", "今天我们来聊一聊",
  "感谢观看", "当天能住", "多撑两周", "进店先倒热茶", "空调常年26度", "空调常年 26 度",
  "留一桶同色漆", "1.8米", "1.8 米", "30厘米", "30 厘米", "含水率10%", "含水率 10%", "这是国标"
] as const;
const actionPatterns = [/点赞/u, /关注/u, /评论/u, /私信/u, /咨询/u, /到店/u];
const numericFactPattern = /(?:[¥￥]\s*\d+(?:\.\d+)?(?:万|千|百)?|(?<![\d.])\d+(?:\.\d+)?\s*(?:平方米|平方厘米|平方毫米|毫升|千克|公斤|厘米|毫米|分钟|小时|个月|万元|块钱|平米|℃|°C|％|%|元|块|折|年|月|周|天|日|秒|米|㎡|升|克|斤|度|级|人|份|个|次|家|店|套))(?![\d.])/giu;
const medicalConditionPattern = /(玫瑰痤疮|皮炎|湿疹|皮肤屏障受损|感染)/gu;
const diagnosticUncertaintyPattern = /可能|疑似|也许|或许|不排除/u;
const diagnosticAssertionPattern = /(?:这是|其实是|确诊(?:为)?|诊断(?:为)?|确定(?:就是|是|为)?|肯定(?:就是|是|为)?|不是|更像|就是|属于|患有|得了|说明(?:你|已经|就是|属于|得了|患有|存在)?)[^。！？\n]{0,10}$/u;
const medicalEducationPattern = /关于[^。！？\n]{0,8}$|(?:避免|预防|防止)[^。！？\n]{0,6}$/u;
const medicalQuestionBeforeConditionPattern = /(?:(?:怎么|如何|怎样)[^，,；;：:]{0,8}(?:判断|区分|识别)[^，,；;：:]{0,8}|(?:是否|是不是)[^，,；;：:]{0,8})$/u;
const medicalQuestionAfterConditionPattern = /^[^，,；;：:]{0,4}(?:吗|呢)\s*$/u;
const medicalReferralPattern = /(?:建议|可以|应该|应当|需要|最好|请)?(?:及时|尽快)?(?:咨询(?:专业)?(?:医生|医师|皮肤科(?:医生|医师)?)|(?:前往)?皮肤科(?:就诊)?|就医|就诊)/gu;
const fixedMerchantSubjects = ["我们店", "咱们店", "本店", "本中心", "门店", "店里", "店内"] as const;
const merchantProjectSuffixes = ["皮肤管理中心", "管理中心", "服务中心", "体验中心", "运营中心", "工作室", "美容院", "有限公司", "公司", "门店", "中心", "店", "馆"] as const;
const merchantCapabilityPattern = /配备|配有|使用|采用|引进|拥有|具备|提供|用的是|坐诊|聘请|有(?!人问|顾客问|客户问|消费者问|用户问)/gu;
const merchantCapabilityNegationPattern = /(?:没有|并未|从未|没|未|不)$/u;
const merchantHighRiskFactPattern = /(进口美容仪|进口仪器|进口设备|进口产品|进口原料|光子嫩肤仪|红蓝光仪|射频仪|激光仪|检测仪|治疗仪|美容仪|超声炮|热玛吉|光子嫩肤|水光仪|点阵激光|皮秒|专利|认证|资质|医生|专家|仪器|设备|进口)/u;

export class CustomScriptValidationError extends Error {
  public readonly reason: CustomScriptValidationReason;
  public readonly repairContext?: CustomScriptLengthRepairContext;

  constructor(reason: "length", repairContext: CustomScriptLengthRepairContext, message?: string);
  constructor(reason: NonLengthValidationReason, message?: string);
  constructor(
    reason: CustomScriptValidationReason,
    contextOrMessage?: CustomScriptLengthRepairContext | string,
    message = "定制化脚本输入或输出不符合契约"
  ) {
    super(typeof contextOrMessage === "string" ? contextOrMessage : message);
    this.reason = reason;
    if (reason === "length" && typeof contextOrMessage === "object") {
      this.repairContext = contextOrMessage;
    }
  }
}

/** Validates and canonicalizes every client-controlled business field. */
export function validateCustomScriptRequestBody(body: Record<string, unknown>): ValidatedCustomScriptInput {
  const clientRequestId = stringField(body.clientRequestId, "client_request_id").toLowerCase();
  if (!uuidPattern.test(clientRequestId)) throw new CustomScriptValidationError("client_request_id");
  const projectId = boundedText(body.projectId, 1, 64, "project_id");
  const requestText = boundedText(body.requestText, 5, 5_000, "request_length");
  const objective = enumField(body.objective, CUSTOM_SCRIPT_OBJECTIVES, "objective");
  const tone = enumField(body.tone, CUSTOM_SCRIPT_TONES, "tone");
  const previousScript = optionalBoundedText(body.previousScript, 1_000, "previous_script");
  const source = parseOfficialTopicSource(requestText);
  const bodySourceProjectId = optionalBoundedText(body.sourceProjectId, 64, "source_project_id");
  const bodySourceType = optionalEnumField(body.sourceType, CUSTOM_SCRIPT_SOURCE_TYPES, "source_type");
  const bodySourceObjective = optionalEnumField(body.sourceObjective, CUSTOM_SCRIPT_OBJECTIVES, "source_objective");

  if (source.inputType === "brief") {
    if (bodySourceProjectId || bodySourceType || bodySourceObjective) {
      throw new CustomScriptValidationError("source_body_without_header");
    }
    return { clientRequestId, projectId, requestText, objective, tone, ...(previousScript ? { previousScript } : {}), inputType: "brief" };
  }

  if (
    source.sourceProjectId !== bodySourceProjectId ||
    source.sourceType !== bodySourceType ||
    source.sourceObjective !== bodySourceObjective
  ) {
    throw new CustomScriptValidationError("source_body_mismatch");
  }
  return {
    clientRequestId,
    projectId,
    requestText,
    objective,
    tone,
    ...(previousScript ? { previousScript } : {}),
    sourceProjectId: source.sourceProjectId,
    sourceType: source.sourceType,
    sourceObjective: source.sourceObjective,
    inputType: source.inputType
  };
}

/** Re-parses the exact copied source header at the server trust boundary. */
export function parseOfficialTopicSource(requestText: string):
  | { inputType: "brief" }
  | {
      inputType: CustomScriptSourceType;
      sourceProjectId: string;
      sourceType: CustomScriptSourceType;
      sourceObjective: CustomScriptObjective;
    } {
  const normalized = normalizeCustomScriptLineEndings(requestText);
  const containsReserved = normalized.includes(officialHeader) || reservedPrefixes.some((prefix) => normalized.includes(prefix));
  if (!containsReserved) return { inputType: "brief" };

  const lines = normalized.split("\n");
  const start = lines.findIndex((line) => !isCustomScriptWhitespaceOnly(line));
  if (start < 0 || lines[start] !== officialHeader) throw new CustomScriptValidationError("source_header_position");
  const sourceProjectId = exactHeaderValue(lines[start + 1], "sourceProjectId:", "source_project_id");
  const sourceType = enumField(
    exactHeaderValue(lines[start + 2], "sourceType:", "source_type"),
    CUSTOM_SCRIPT_SOURCE_TYPES,
    "source_type"
  );
  const sourceObjective = enumField(
    exactHeaderValue(lines[start + 3], "sourceObjective:", "source_objective"),
    CUSTOM_SCRIPT_OBJECTIVES,
    "source_objective"
  );
  const projectNameLine = lines[start + 4] ?? "";
  if (!projectNameLine.startsWith("商家项目：") || !normalizeCustomScriptText(projectNameLine.slice("商家项目：".length))) {
    throw new CustomScriptValidationError("source_project_name");
  }
  if (projectNameLine.includes(officialHeader) || reservedPrefixes.some((prefix) => projectNameLine.includes(prefix))) {
    throw new CustomScriptValidationError("source_project_name");
  }
  const content = lines.slice(start + 5).join("\n");
  if (!normalizeCustomScriptText(content)) throw new CustomScriptValidationError("source_content_empty");
  if (content.includes(officialHeader) || reservedPrefixes.some((prefix) => content.includes(prefix))) {
    throw new CustomScriptValidationError("source_reserved_duplicate");
  }
  if (sourceType === "topic" && sourceObjective !== "auto") throw new CustomScriptValidationError("source_objective");
  if (sourceType === "top_pick" && sourceObjective === "auto") throw new CustomScriptValidationError("source_objective");
  return { inputType: sourceType, sourceProjectId, sourceType, sourceObjective };
}

export function canonicalCustomScriptInputHash(input: ValidatedCustomScriptInput) {
  const canonical = [
    input.projectId,
    input.requestText,
    input.objective,
    input.tone,
    input.previousScript || "",
    input.sourceProjectId || "",
    input.sourceType || "",
    input.sourceObjective || ""
  ].map((value) => normalizeCustomScriptText(value));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Rejects all partial, explanatory, malformed, unsafe, or duplicate model output. */
export function validateCustomScriptDomainOutput(
  value: unknown,
  context: CustomScriptValidationContext
): CustomScriptDomainResult {
  if (!isRecord(value) || typeof value.status !== "string") throw new CustomScriptValidationError("shape");
  if (value.status === "needs_profile") {
    if (!hasExactKeys(value, ["status", "missingFacts"]) || !Array.isArray(value.missingFacts)) {
      throw new CustomScriptValidationError("missing_facts_shape");
    }
    const facts = value.missingFacts;
    if (facts.length < 1 || facts.length > 5 || !facts.every(isMissingFactCode) || new Set(facts).size !== facts.length) {
      throw new CustomScriptValidationError("missing_facts_value");
    }
    return { status: "needs_profile", missingFacts: facts as MissingFactCode[] };
  }
  if (value.status !== "success" || !hasExactKeys(value, ["status", "finalScript"]) || typeof value.finalScript !== "string") {
    throw new CustomScriptValidationError("shape");
  }
  const finalScript = normalizeCustomScriptText(value.finalScript);
  validateSpeechContent(finalScript);
  validateForbiddenContent(finalScript, context);
  validateRegenerationDifference(finalScript, context.previousScript);
  const count = countCustomScriptCodePoints(finalScript);
  if (count < CUSTOM_SCRIPT_MIN_CODE_POINTS || count > CUSTOM_SCRIPT_MAX_CODE_POINTS) {
    throw new CustomScriptValidationError("length", createCustomScriptLengthRepairContext(count));
  }
  return { status: "success", finalScript };
}

function validateSpeechContent(script: string) {
  const lines = script.split("\n").filter((line) => !isCustomScriptWhitespaceOnly(line));
  if (!lines.length) throw new CustomScriptValidationError("empty_script");
  if (!/[\p{L}\p{N}]/u.test(script)) throw new CustomScriptValidationError("non_speech_content");
  for (const line of lines) {
    if (/^\s*(?:(?:[#>*+-]|\d+[.)、])|(?:标题|分镜|时间轴)\s*[:：])/u.test(line)) {
      throw new CustomScriptValidationError("list_or_heading");
    }
  }
  if (/\p{Extended_Pictographic}/u.test(script) || /\{\{|\}\}|\[[^\]]*\]|<[^>]+>/u.test(script)) {
    throw new CustomScriptValidationError("non_speech_content");
  }
}

function validateForbiddenContent(
  script: string,
  context: CustomScriptValidationContext
) {
  const compact = script.replace(/\p{White_Space}/gu, "").toLowerCase();
  const phrase = forbiddenPhrases.find((item) => compact.includes(item.replace(/\p{White_Space}/gu, "").toLowerCase()));
  if (phrase) throw new CustomScriptValidationError("forbidden_expression");

  const profileFacts = new Set(extractCustomScriptNumericFactTokens(context.merchantProfileText));
  const unsupportedNumericFact = extractCustomScriptNumericFactTokens(script).find((fact) => !profileFacts.has(fact));
  if (unsupportedNumericFact) throw new CustomScriptValidationError("fact_safety");

  if (hasUnsupportedDiagnosis(script)) throw new CustomScriptValidationError("fact_safety");
  const unsupportedMerchantClaim = findUnsupportedMerchantHighRiskClaim(
    script,
    context.merchantProjectName,
    context.merchantProfileText
  );
  if (unsupportedMerchantClaim) throw new CustomScriptValidationError("fact_safety");

  const requestAllowsAction = /点赞|关注|评论|私信|咨询|到店|行动引导/u.test(context.requestText);
  const marketingActionText = script.replace(medicalReferralPattern, "");
  const actionCount = actionPatterns.reduce(
    (total, pattern) => total + (marketingActionText.match(new RegExp(pattern.source, "gu"))?.length ?? 0),
    0
  );
  if ((!requestAllowsAction && context.objective !== "conversion" && actionCount > 0) || actionCount > 1) {
    throw new CustomScriptValidationError("cta");
  }
}

function hasUnsupportedDiagnosis(script: string) {
  for (const sentence of script.split(/[。！？\n]/u)) {
    medicalConditionPattern.lastIndex = 0;
    for (const condition of sentence.matchAll(medicalConditionPattern)) {
      const beforeCondition = sentence.slice(0, condition.index);
      if (isMedicalQuestionForCondition(sentence, condition.index, condition[0].length)) continue;
      const nearbyContext = beforeCondition.slice(-18);
      if (diagnosticUncertaintyPattern.test(nearbyContext)) continue;
      if (medicalEducationPattern.test(nearbyContext)) continue;
      if (diagnosticAssertionPattern.test(nearbyContext)) return true;
    }
  }
  return false;
}

function isMedicalQuestionForCondition(sentence: string, conditionIndex: number, conditionLength: number) {
  const beforeCondition = sentence.slice(0, conditionIndex);
  const clauseBoundary = Math.max(
    beforeCondition.lastIndexOf("，"),
    beforeCondition.lastIndexOf(","),
    beforeCondition.lastIndexOf("；"),
    beforeCondition.lastIndexOf(";"),
    beforeCondition.lastIndexOf("："),
    beforeCondition.lastIndexOf(":")
  );
  const currentClauseBefore = beforeCondition.slice(clauseBoundary + 1);
  const currentClauseAfter = sentence.slice(conditionIndex + conditionLength);
  return medicalQuestionBeforeConditionPattern.test(currentClauseBefore)
    || medicalQuestionAfterConditionPattern.test(currentClauseAfter);
}

function findUnsupportedMerchantHighRiskClaim(
  script: string,
  merchantProjectName: string,
  merchantProfileText: string
) {
  const compactProfile = merchantProfileText.replace(/\p{White_Space}/gu, "");
  const subjects = merchantSubjects(merchantProjectName);
  for (const sentence of script.split(/[。！？\n]/u)) {
    for (const subject of subjects) {
      const subjectIndex = sentence.indexOf(subject);
      if (subjectIndex < 0) continue;
      const assertion = sentence.slice(subjectIndex + subject.length, subjectIndex + subject.length + 40);
      merchantCapabilityPattern.lastIndex = 0;
      for (const capability of assertion.matchAll(merchantCapabilityPattern)) {
        const capabilityIndex = capability.index;
        const beforeCapability = assertion.slice(Math.max(0, capabilityIndex - 3), capabilityIndex);
        if (merchantCapabilityNegationPattern.test(beforeCapability)) continue;
        const capabilityAssertion = assertion.slice(capabilityIndex + capability[0].length);
        const risk = capabilityAssertion.match(merchantHighRiskFactPattern);
        const maxRiskDistance = capability[0] === "有" ? 2 : 6;
        if (!risk || risk.index === undefined || risk.index > maxRiskDistance) continue;
        if (!compactProfile.includes(risk[0])) return risk[0];
      }
    }
  }
  return undefined;
}

function merchantSubjects(merchantProjectName: string) {
  const projectName = normalizeCustomScriptText(merchantProjectName).replace(/\p{White_Space}/gu, "");
  let brandName = projectName;
  for (const suffix of merchantProjectSuffixes) {
    if (!brandName.endsWith(suffix)) continue;
    const candidate = brandName.slice(0, -suffix.length);
    if (Array.from(candidate).length >= 2) brandName = candidate;
    break;
  }
  return [...new Set([
    ...fixedMerchantSubjects,
    ...(projectName ? [projectName] : []),
    ...(brandName !== projectName && Array.from(brandName).length >= 2 ? [brandName] : [])
  ])];
}

function validateRegenerationDifference(script: string, previousScript?: string) {
  if (!previousScript) return;
  const normalizedPrevious = normalizeCustomScriptText(previousScript);
  const comparable = (value: string) => value.replace(/[\p{White_Space}\p{Punctuation}]/gu, "");
  const currentComparable = comparable(script);
  const previousComparable = comparable(normalizedPrevious);
  if (currentComparable === previousComparable) throw new CustomScriptValidationError("duplicate_previous");
  if (multisetDiceSimilarity(currentComparable, previousComparable) >= 0.82) {
    throw new CustomScriptValidationError("duplicate_body");
  }
  const firstLine = script.split("\n").find((line) => !isCustomScriptWhitespaceOnly(line));
  const previousFirstLine = normalizedPrevious.split("\n").find((line) => !isCustomScriptWhitespaceOnly(line));
  if (firstLine && previousFirstLine && comparable(firstLine) === comparable(previousFirstLine)) {
    throw new CustomScriptValidationError("duplicate_opening");
  }
  const currentBody = normalizedComparableLines(script).slice(1);
  const previousBody = normalizedComparableLines(normalizedPrevious).slice(1);
  if (!currentBody.length || !previousBody.length) return;

  // Exact-line reuse catches a changed hook followed by a mostly copied body.
  const availablePreviousLines = new Map<string, number>();
  for (const line of previousBody) availablePreviousLines.set(line, (availablePreviousLines.get(line) || 0) + 1);
  let reusedLines = 0;
  for (const line of currentBody) {
    const available = availablePreviousLines.get(line) || 0;
    if (available > 0) {
      reusedLines += 1;
      availablePreviousLines.set(line, available - 1);
    }
  }
  const reusedLineRatio = reusedLines / Math.max(currentBody.length, previousBody.length);
  if (reusedLineRatio >= 0.7) throw new CustomScriptValidationError("duplicate_body");

  // Character-bigram Dice similarity catches light synonym or punctuation edits.
  if (multisetDiceSimilarity(currentBody.join(""), previousBody.join("")) >= 0.82) {
    throw new CustomScriptValidationError("duplicate_body");
  }
}

/** Extracts conservative number+unit facts so 30元 never matches a profile-only 130元. */
export function extractCustomScriptNumericFactTokens(value: string) {
  const normalized = normalizeCustomScriptText(value)
    .replace(/％/gu, "%")
    .replace(/￥/gu, "¥");
  return (normalized.match(numericFactPattern) ?? []).map((token) => token.replace(/\p{White_Space}/gu, "").toLowerCase());
}

function normalizedComparableLines(value: string) {
  return normalizeCustomScriptText(value)
    .split("\n")
    .filter((line) => !isCustomScriptWhitespaceOnly(line))
    .map((line) => line.replace(/[\p{White_Space}\p{Punctuation}]/gu, ""));
}

function multisetDiceSimilarity(left: string, right: string) {
  const leftBigrams = bigramCounts(left);
  const rightBigrams = bigramCounts(right);
  const leftTotal = Math.max(0, Array.from(left).length - 1);
  const rightTotal = Math.max(0, Array.from(right).length - 1);
  if (!leftTotal || !rightTotal) return 0;
  let overlap = 0;
  for (const [bigram, count] of leftBigrams) overlap += Math.min(count, rightBigrams.get(bigram) || 0);
  return (2 * overlap) / (leftTotal + rightTotal);
}

function bigramCounts(value: string) {
  const characters = Array.from(value);
  const counts = new Map<string, number>();
  for (let index = 0; index < characters.length - 1; index += 1) {
    const bigram = `${characters[index]}${characters[index + 1]}`;
    counts.set(bigram, (counts.get(bigram) || 0) + 1);
  }
  return counts;
}

function exactHeaderValue(line: string | undefined, prefix: string, reason: NonLengthValidationReason) {
  if (!line?.startsWith(prefix)) throw new CustomScriptValidationError(reason);
  const value = normalizeCustomScriptText(line.slice(prefix.length));
  if (!value || value.includes(":")) throw new CustomScriptValidationError(reason);
  return value;
}

function boundedText(value: unknown, minimum: number, maximum: number, reason: NonLengthValidationReason) {
  const text = normalizeCustomScriptText(stringField(value, reason));
  const count = countNormalizedCustomScriptCodePoints(text);
  if (count < minimum || count > maximum) throw new CustomScriptValidationError(reason);
  return text;
}

function optionalBoundedText(value: unknown, maximum: number, reason: NonLengthValidationReason) {
  if (value === undefined) return undefined;
  return boundedText(value, 1, maximum, reason);
}

function stringField(value: unknown, reason: NonLengthValidationReason) {
  if (typeof value !== "string") throw new CustomScriptValidationError(reason);
  return value;
}

function enumField<const T extends readonly string[]>(value: unknown, choices: T, reason: NonLengthValidationReason): T[number] {
  if (typeof value !== "string" || !(choices as readonly string[]).includes(value)) throw new CustomScriptValidationError(reason);
  return value as T[number];
}

function optionalEnumField<const T extends readonly string[]>(value: unknown, choices: T, reason: NonLengthValidationReason) {
  if (value === undefined) return undefined;
  return enumField(value, choices, reason);
}

function isMissingFactCode(value: unknown): value is MissingFactCode {
  return typeof value === "string" && MISSING_FACT_CODES.includes(value as MissingFactCode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}
