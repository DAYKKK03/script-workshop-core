import {
  MISSING_FACT_LABELS,
  type MissingFactCode
} from "@/lib/custom-scripts/missing-facts";

export type { MissingFactCode } from "@/lib/custom-scripts/missing-facts";

export type CustomScriptProjectOption = {
  id: string;
  projectName: string;
};

export type CustomScriptObjective = "auto" | "traffic" | "trust" | "conversion";

export type CustomScriptTone = "auto" | "natural" | "professional" | "emotional";

export type CustomScriptResult =
  | { status: "initial" }
  | { status: "processing" }
  | { status: "success"; finalScript: string }
  | { status: "needs_profile"; missingFacts: MissingFactCode[] }
  | { status: "failed"; message: string }
  | { status: "canceled" };

export type CustomScriptPreviewState =
  | "empty"
  | "processing"
  | "success"
  | "needs_profile"
  | "error";

export type CustomScriptDraft = {
  projectId: string;
  requestText: string;
  objective: CustomScriptObjective;
  tone: CustomScriptTone;
  sourceProjectId?: string;
  sourceType?: "topic" | "top_pick";
  sourceObjective?: CustomScriptObjective;
};

export const objectiveOptions: ReadonlyArray<{
  value: CustomScriptObjective;
  label: string;
}> = [
  { value: "auto", label: "自动" },
  { value: "traffic", label: "引流" },
  { value: "trust", label: "信任" },
  { value: "conversion", label: "转化" }
];

export const toneOptions: ReadonlyArray<{
  value: CustomScriptTone;
  label: string;
}> = [
  { value: "auto", label: "自动" },
  { value: "natural", label: "自然聊天" },
  { value: "professional", label: "专业可信" },
  { value: "emotional", label: "情绪共鸣" }
];

export const missingFactLabels: Readonly<Record<MissingFactCode, string>> = MISSING_FACT_LABELS;
