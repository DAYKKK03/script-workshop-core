export const VIRAL_ELEMENTS = [
  "成本", "借势", "对立", "幕后", "反差",
  "猎奇", "人群", "怀旧", "糟糕", "性感"
] as const;

export type ViralElement = (typeof VIRAL_ELEMENTS)[number];
export type TopicObjective = "traffic" | "trust" | "conversion";
export type ShootingDifficulty = "low" | "medium" | "high";

export type TopicAnalysis = {
  track: string;
  keywords: string[];
  audienceScenes: string[];
  projectUpdatedAt: string;
};

export type TopicIdea = {
  keywordIndex: number;
  audienceSceneIndex: number;
  keyword: string;
  audienceScene: string;
  title: string;
  opening: string;
  hook: string;
  viralElements: ViralElement[];
  viralElementReason: string;
};

export type TopicTopPick = {
  objective: TopicObjective;
  keywordIndex: number;
  audienceSceneIndex: number;
  reason: string;
  shootingDifficulty: ShootingDifficulty;
  requiredMaterials: string[];
  suggestedScene: string;
  riskNote: string;
};

export type TopicGeneration = { ideas: TopicIdea[]; topPicks: TopicTopPick[] };
