import { VIRAL_ELEMENTS, type TopicAnalysis, type TopicGeneration, type TopicIdea, type TopicObjective, type TopicTopPick, type ViralElement } from "@/lib/topics/types";
import { isOrdinaryTopicTitle } from "@/lib/topics/strategy-library";

export type AssemblyRule = "batch_count" | "batch_size" | "idea_count" | "coordinate_duplicate" | "coordinate_mismatch" | "title_duplicate" | "top_objective" | "top_coordinate_duplicate" | "top_coordinate_missing";
export type DuplicateScope = "within_batch" | "against_existing" | "both";
export type DuplicateCountBucket = "0" | "1" | "2-5" | ">5";
export type UniquePreservedCountBucket = "0" | "1-4" | "5";

export function normalizeTopicTitle(title: string) {
  return title.replace(/[\s，。！？、,.!?：:；;（）()《》“”"']/g, "").toLocaleLowerCase("zh-CN");
}

export class TopicValidationError extends Error {
  constructor(
    public code: string,
    message: string,
    public assemblyRule?: AssemblyRule,
    public duplicateScope?: DuplicateScope,
    public duplicateCountBucket?: DuplicateCountBucket,
    public uniquePreservedCountBucket?: UniquePreservedCountBucket
  ) { super(message); }
  repairItems?: TopicIdea[];
  preservedItems?: TopicIdea[];
}

export type TopicTitleDuplicateDiagnostics = {
  duplicateScope?: DuplicateScope;
  duplicateCountBucket: DuplicateCountBucket;
  uniquePreservedCountBucket: UniquePreservedCountBucket;
  violatingIndexes: number[];
};

function countBucket(count: number): DuplicateCountBucket {
  if (count === 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  return ">5";
}

function preservedBucket(count: number): UniquePreservedCountBucket {
  if (count === 0) return "0";
  if (count >= 5) return "5";
  return "1-4";
}

/**
 * Computes title-duplicate telemetry in memory only; it deliberately returns no title or coordinate values.
 */
export function inspectTopicTitleDuplicates(titles: string[], existingTitles: string[]): TopicTitleDuplicateDiagnostics {
  const normalized = titles.map(normalizeTopicTitle);
  const existing = new Set(existingTitles.map(normalizeTopicTitle));
  const violatingIndexes = new Set<number>();
  let withinCount = 0;
  let againstCount = 0;
  normalized.forEach((title, index) => {
    const within = normalized.some((other, otherIndex) => otherIndex !== index && other === title);
    const against = existing.has(title);
    if (within) { withinCount += 1; violatingIndexes.add(index); }
    if (against) { againstCount += 1; violatingIndexes.add(index); }
  });
  const duplicateScope = withinCount > 0 && againstCount > 0
    ? "both"
    : withinCount > 0
      ? "within_batch"
      : againstCount > 0
        ? "against_existing"
        : undefined;
  return {
    ...(duplicateScope ? { duplicateScope } : {}),
    duplicateCountBucket: countBucket(violatingIndexes.size),
    uniquePreservedCountBucket: preservedBucket(titles.length - violatingIndexes.size),
    violatingIndexes: [...violatingIndexes]
  };
}

export type TopicValidationStage = "analysis" | "batch" | "top3" | "assembly";

const objectives: TopicObjective[] = ["traffic", "trust", "conversion"];
const difficulties = new Set(["low", "medium", "high"]);
const viralElementSet = new Set<string>(VIRAL_ELEMENTS);
const unsafePatterns = [
  /全网最低|全城最低|百分之百|保证爆|保证赚钱/,
  /潜规则|黑幕|行业内幕/,
  /垃圾商家|骗子商家|某某店.*(差|烂|坑)/,
  /色情|裸露|性暗示|未成年.*性感/
];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "AI 返回格式不符合要求");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", `${field}格式不符合要求`);
  return value.trim();
}

function stringList(value: unknown, field: string, count?: number, maxItem = 80) {
  if (!Array.isArray(value) || (count !== undefined && value.length !== count)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", `${field}数量不符合要求`);
  const result = value.map((item) => text(item, field, maxItem));
  if (new Set(result.map((item) => item.toLocaleLowerCase("zh-CN"))).size !== result.length) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", `${field}不能重复`);
  return result;
}

function integer(value: unknown, field: string, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", `${field}越界`);
  return value as number;
}

export function parseAnalysisOutput(content: string): Omit<TopicAnalysis, "projectUpdatedAt"> {
  const data = asRecord(JSON.parse(content));
  if (data.profileSufficient !== true) throw new TopicValidationError("PROJECT_PROFILE_INSUFFICIENT", "请补充主营产品、核心卖点、消费人群和消费场景后再分析");
  return { track: text(data.track, "行业赛道", 100), keywords: stringList(data.keywords, "行业关键词", 5), audienceScenes: stringList(data.audienceScenes, "消费对象或场景", 5) };
}

function parseIdea(value: unknown, keywords: string[], audienceScenes: string[]): TopicIdea {
  const item = asRecord(value);
  const keywordIndex = integer(item.keywordIndex, "关键词坐标", 0, 4);
  const audienceSceneIndex = integer(item.audienceSceneIndex, "场景坐标", 0, 4);
  const viralElements = stringList(item.viralElements, "爆款元素");
  if (viralElements.length < 1 || viralElements.length > 2 || viralElements.some((entry) => !viralElementSet.has(entry))) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "爆款元素不在允许范围内");
  const result: TopicIdea = {
    keywordIndex, audienceSceneIndex,
    keyword: text(item.keyword, "关键词", 80), audienceScene: text(item.audienceScene, "消费场景", 80),
    title: text(item.title, "标题", 120), opening: text(item.opening, "开篇", 300), hook: text(item.hook, "钩子", 300),
    viralElements: viralElements as ViralElement[], viralElementReason: text(item.viralElementReason, "爆款元素说明", 300)
  };
  if (result.keyword !== keywords[keywordIndex] || result.audienceScene !== audienceScenes[audienceSceneIndex]) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "选题坐标与输入条件不一致");
  if (isOrdinaryTopicTitle(result.title)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "标题过于模板化，请加入具体场景、动作或结果");
  const safetyText = `${result.title}\n${result.opening}\n${result.hook}\n${result.viralElementReason}`;
  if (unsafePatterns.some((pattern) => pattern.test(safetyText))) throw new TopicValidationError("AI_PROVIDER_UNSAFE_RESPONSE", "AI 结果未通过安全校验");
  return result;
}

function parseTopPick(value: unknown): TopicTopPick {
  const item = asRecord(value);
  const objective = text(item.objective, "推荐目标", 20) as TopicObjective;
  const shootingDifficulty = text(item.shootingDifficulty, "拍摄难度", 20);
  if (!objectives.includes(objective) || !difficulties.has(shootingDifficulty)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "Top 3字段不符合要求");
  const requiredMaterials = stringList(item.requiredMaterials, "所需素材", undefined, 100);
  if (requiredMaterials.length < 1 || requiredMaterials.length > 8) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "所需素材数量不符合要求");
  return {
    objective, keywordIndex: integer(item.keywordIndex, "关键词坐标", 0, 4), audienceSceneIndex: integer(item.audienceSceneIndex, "场景坐标", 0, 4),
    reason: text(item.reason, "推荐理由", 300), shootingDifficulty: shootingDifficulty as TopicTopPick["shootingDifficulty"],
    requiredMaterials, suggestedScene: text(item.suggestedScene, "拍摄场景", 200), riskNote: text(item.riskNote, "风险提醒", 300)
  };
}

export function parseGenerationOutput(content: string, keywords: string[], audienceScenes: string[]): TopicGeneration {
  const data = asRecord(JSON.parse(content));
  if (!Array.isArray(data.ideas) || data.ideas.length !== 25 || !Array.isArray(data.topPicks) || data.topPicks.length !== 3) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "必须返回完整25宫格和Top 3");
  const ideas = validateIdeas(data.ideas.map((item) => parseIdea(item, keywords, audienceScenes)), keywords, audienceScenes);
  const topPicks = validateTopPicks(data.topPicks.map(parseTopPick), ideas);
  return { ideas, topPicks };
}

export function parseTopicIdeaBatchOutput(content: string, keywords: string[], audienceScenes: string[], audienceSceneIndex: number): TopicIdea[] {
  const data = asRecord(JSON.parse(content));
  if (!Array.isArray(data.ideas) || data.ideas.length !== 5) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "每批必须返回5个选题");
  const ideas = data.ideas.map((item) => parseIdea(item, keywords, audienceScenes));
  if (ideas.some((idea, index) => idea.audienceSceneIndex !== audienceSceneIndex || idea.keywordIndex !== index)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "批次坐标必须覆盖当前场景的5个关键词");
  return ideas;
}

export function parseTopicIdeaRepairOutput(content: string, keywords: string[], audienceScenes: string[], repairItems: TopicIdea[]): TopicIdea[] {
  const data = asRecord(JSON.parse(content));
  if (!Array.isArray(data.ideas) || data.ideas.length !== repairItems.length) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "修复选题数量不符合要求");
  const ideas = data.ideas.map((item) => parseIdea(item, keywords, audienceScenes));
  const expectedCoordinates = new Set(repairItems.map((item) => `${item.audienceSceneIndex}:${item.keywordIndex}`));
  const actualCoordinates = ideas.map((item) => `${item.audienceSceneIndex}:${item.keywordIndex}`);
  if (new Set(actualCoordinates).size !== actualCoordinates.length || actualCoordinates.some((coordinate) => !expectedCoordinates.has(coordinate))) {
    throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "修复选题坐标不符合要求");
  }
  return ideas;
}

export function parseTopicTopPicksOutput(content: string, ideas: TopicIdea[]): TopicTopPick[] {
  const data = asRecord(JSON.parse(content));
  if (!Array.isArray(data.topPicks) || data.topPicks.length !== 3) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "必须返回完整Top 3");
  return validateTopPicks(data.topPicks.map(parseTopPick), ideas);
}

export function assembleTopicGeneration(ideaBatches: TopicIdea[][], topPicks: TopicTopPick[], keywords: string[], audienceScenes: string[]): TopicGeneration {
  if (ideaBatches.length !== 5) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "必须完成5个选题批次", "batch_count");
  if (ideaBatches.some((batch) => batch.length !== 5)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "每个选题批次必须包含5项", "batch_size");
  const rawIdeas = ideaBatches.flat();
  if (rawIdeas.length !== 25) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "必须完成25个选题", "idea_count");
  const coords = rawIdeas.map((item) => `${item.audienceSceneIndex}:${item.keywordIndex}`);
  if (new Set(coords).size !== coords.length) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "组装后的坐标重复", "coordinate_duplicate");
  if (rawIdeas.some((item, index) => item.audienceSceneIndex !== Math.floor(index / 5) || item.keywordIndex !== index % 5)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "组装后的坐标不匹配", "coordinate_mismatch");
  if (rawIdeas.some((item) => item.keyword !== keywords[item.keywordIndex] || item.audienceScene !== audienceScenes[item.audienceSceneIndex])) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "组装后的关键词或场景不匹配", "coordinate_mismatch");
  const normalizedTitles = rawIdeas.map((item) => normalizeTopicTitle(item.title));
  if (new Set(normalizedTitles).size !== normalizedTitles.length) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "组装后的标题重复", "title_duplicate");
  const ideas = validateIdeas(rawIdeas, keywords, audienceScenes);
  if (new Set(topPicks.map((pick) => pick.objective)).size !== 3 || !["traffic", "trust", "conversion"].every((objective) => topPicks.some((pick) => pick.objective === objective))) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "Top 3目标不完整", "top_objective");
  const topCoords = topPicks.map((pick) => `${pick.audienceSceneIndex}:${pick.keywordIndex}`);
  if (new Set(topCoords).size !== topCoords.length) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "Top 3坐标重复", "top_coordinate_duplicate");
  if (topCoords.some((coordinate) => !coords.includes(coordinate))) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "Top 3坐标不存在", "top_coordinate_missing");
  return { ideas, topPicks: validateTopPicks(topPicks, ideas) };
}

function validateIdeas(ideas: TopicIdea[], keywords: string[], audienceScenes: string[]) {
  if (ideas.length !== 25) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "必须返回完整25宫格");
  const coordinates = ideas.map((item) => `${item.audienceSceneIndex}:${item.keywordIndex}`);
  if (new Set(coordinates).size !== 25 || ideas.some((item, index) => item.audienceSceneIndex !== Math.floor(index / 5) || item.keywordIndex !== index % 5)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "25宫格坐标必须完整且顺序稳定");
  if (ideas.some((idea) => idea.keyword !== keywords[idea.keywordIndex] || idea.audienceScene !== audienceScenes[idea.audienceSceneIndex])) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "选题坐标与输入条件不一致");
  const normalizedTitles = ideas.map((item) => normalizeTopicTitle(item.title));
  if (new Set(normalizedTitles).size !== 25) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "25个选题标题不能重复");
  return ideas;
}

function validateTopPicks(topPicks: TopicTopPick[], ideas: TopicIdea[]) {
  if (objectives.some((objective) => topPicks.filter((pick) => pick.objective === objective).length !== 1)) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "Top 3必须分别覆盖引流、信任和转化");
  const coordinates = ideas.map((item) => `${item.audienceSceneIndex}:${item.keywordIndex}`);
  const topCoordinates = topPicks.map((pick) => `${pick.audienceSceneIndex}:${pick.keywordIndex}`);
  if (new Set(topCoordinates).size !== 3 || topCoordinates.some((coordinate) => !coordinates.includes(coordinate))) throw new TopicValidationError("AI_PROVIDER_INVALID_RESPONSE", "Top 3必须引用三个不同的宫格选题");
  return topPicks;
}

export function validateGenerationInput(input: Record<string, unknown>) {
  const projectId = text(input.projectId, "商家项目", 100);
  const analyzedProjectUpdatedAt = text(input.analyzedProjectUpdatedAt, "项目更新时间", 100);
  if (Number.isNaN(Date.parse(analyzedProjectUpdatedAt))) throw new TopicValidationError("INVALID_PROJECT_UPDATED_AT", "请重新分析商家资料");
  return { projectId, analyzedProjectUpdatedAt, track: text(input.track, "行业赛道", 100), keywords: stringList(input.keywords, "行业关键词", 5), audienceScenes: stringList(input.audienceScenes, "消费对象或场景", 5) };
}
