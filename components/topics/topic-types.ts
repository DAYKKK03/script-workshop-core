export const viralElementNames = ["成本", "借势", "对立", "幕后", "反差", "猎奇", "人群", "怀旧", "糟糕", "性感"] as const;
export type TopicObjective = "traffic" | "trust" | "conversion";
export type TopicIdea = {
  keywordIndex: number;
  audienceSceneIndex: number;
  keyword: string;
  audienceScene: string;
  title: string;
  opening: string;
  hook: string;
  viralElements: string[];
  viralElementReason: string;
};
export type TopPick = {
  objective: TopicObjective;
  keywordIndex: number;
  audienceSceneIndex: number;
  reason: string;
  shootingDifficulty: "low" | "medium" | "high";
  requiredMaterials: string[];
  suggestedScene: string;
  riskNote: string;
};
