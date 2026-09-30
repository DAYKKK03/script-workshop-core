import type { TopicIdea, TopPick, TopicObjective } from "./topic-types";

export type TopicCopyProject = {
  id: string;
  projectName: string;
};

const objectiveLabels: Record<TopicObjective, string> = {
  traffic: "引流优先",
  trust: "信任优先",
  conversion: "转化优先"
};

const difficultyLabels = { low: "低", medium: "中", high: "高" } as const;

/** Produces the machine-verifiable source header plus the human-readable topic plan. */
export function formatTopicForCopy(idea: TopicIdea, project: TopicCopyProject) {
  return `${formatSourceHeader(project, "topic", "auto")}\n${formatTopicBody(idea)}`;
}

/** Keeps the Top 3 objective in the signed source metadata while preserving decision details. */
export function formatTopPickForCopy(
  idea: TopicIdea,
  pick: TopPick,
  project: TopicCopyProject
) {
  return `${formatSourceHeader(project, "top_pick", pick.objective)}\n${objectiveLabels[pick.objective]}\n${formatTopicBody(idea)}\n推荐理由：${pick.reason}\n拍摄难度：${difficultyLabels[pick.shootingDifficulty]}\n准备素材：${pick.requiredMaterials.join("、")}\n拍摄场景：${pick.suggestedScene}\n风险提醒：${pick.riskNote}`;
}

export function sanitizeTopicCopyProjectName(projectName: string) {
  return projectName
    .replace(/[\r\n\u2028\u2029]/gu, " ")
    .replace(/\p{White_Space}+/gu, " ")
    .trim();
}

function formatSourceHeader(
  project: TopicCopyProject,
  sourceType: "topic" | "top_pick",
  sourceObjective: "auto" | TopicObjective
) {
  return [
    "【脚本工坊爆款选题】",
    `sourceProjectId: ${project.id}`,
    `sourceType: ${sourceType}`,
    `sourceObjective: ${sourceObjective}`,
    `商家项目：${sanitizeTopicCopyProjectName(project.projectName)}`
  ].join("\n");
}

function formatTopicBody(idea: TopicIdea) {
  return `选题标题：${idea.title}\n关键词：${idea.keyword}\n消费对象/场景：${idea.audienceScene}\n开篇：${idea.opening}\n核心钩子：${idea.hook}\n爆款元素：${idea.viralElements.join("、")}\n应用说明：${idea.viralElementReason}`;
}
