import type { CustomScriptObjective } from "./custom-script-types";
import {
  isCustomScriptWhitespaceOnly,
  normalizeCustomScriptLineEndings,
  normalizeCustomScriptText
} from "@/lib/custom-scripts/text";

const officialHeader = "【脚本工坊爆款选题】";
const reservedPrefixes = ["sourceProjectId:", "sourceType:", "sourceObjective:"];

export type CustomScriptInputClassification =
  | { kind: "empty"; label: "等待输入" }
  | { kind: "brief"; label: "自由创作需求" }
  | {
      kind: "topic" | "top_pick";
      label: "爆款选题方案" | "Top 3 优先拍方案";
      sourceProjectId: string;
      sourceObjective: CustomScriptObjective;
    }
  | { kind: "invalid_source"; label: "来源格式异常"; message: string };

/**
 * Recognizes only the signed-in product's exact copy format. The server must
 * repeat this validation because browser classification is an interaction aid,
 * not a trust boundary.
 */
export function classifyCustomScriptInput(
  value: string
): CustomScriptInputClassification {
  const normalized = normalizeCustomScriptLineEndings(value);
  if (isCustomScriptWhitespaceOnly(normalized)) return { kind: "empty", label: "等待输入" };

  const containsReservedSourceText =
    normalized.includes(officialHeader) ||
    reservedPrefixes.some((prefix) => normalized.includes(prefix));
  if (!containsReservedSourceText) return { kind: "brief", label: "自由创作需求" };

  const lines = normalized.split("\n");
  const headerStartIndex = lines.findIndex((line) => !isCustomScriptWhitespaceOnly(line));
  if (headerStartIndex < 0 || lines[headerStartIndex] !== officialHeader) {
    return invalid("选题来源标记不完整，请重新复制爆款选题方案。");
  }

  const sourceProjectLine = lines[headerStartIndex + 1] ?? "";
  const sourceTypeLine = lines[headerStartIndex + 2] ?? "";
  const sourceObjectiveLine = lines[headerStartIndex + 3] ?? "";
  const projectNameLine = lines[headerStartIndex + 4] ?? "";
  const sourceProjectId = exactValue(sourceProjectLine, "sourceProjectId:");
  const sourceType = exactValue(sourceTypeLine, "sourceType:");
  const sourceObjective = exactValue(sourceObjectiveLine, "sourceObjective:");

  if (
    !sourceProjectId ||
    !["topic", "top_pick"].includes(sourceType) ||
    !isObjective(sourceObjective) ||
    !projectNameLine.startsWith("商家项目：") ||
    !normalizeCustomScriptText(projectNameLine.slice("商家项目：".length)) ||
    projectNameLine.includes(officialHeader) ||
    reservedPrefixes.some((prefix) => projectNameLine.includes(prefix))
  ) {
    return invalid("选题来源字段不完整，请返回爆款选题重新复制。");
  }

  const remainingText = lines.slice(headerStartIndex + 5).join("\n");
  if (
    remainingText.includes(officialHeader) ||
    reservedPrefixes.some((prefix) => remainingText.includes(prefix))
  ) {
    return invalid("选题来源字段重复，请重新复制一条完整方案。");
  }

  if (sourceType === "topic" && sourceObjective !== "auto") {
    return invalid("普通选题的目标来源无效，请重新复制。");
  }
  if (sourceType === "top_pick" && sourceObjective === "auto") {
    return invalid("Top 3 选题缺少内容目标，请重新复制。");
  }

  return sourceType === "topic"
    ? {
        kind: "topic",
        label: "爆款选题方案",
        sourceProjectId,
        sourceObjective
      }
    : {
        kind: "top_pick",
        label: "Top 3 优先拍方案",
        sourceProjectId,
        sourceObjective
      };
}

export function resolveObjectiveForSourceChange(
  previous: CustomScriptInputClassification,
  next: CustomScriptInputClassification,
  currentObjective: CustomScriptObjective
) {
  if (!isOfficialSource(next)) return currentObjective;
  if (
    !isOfficialSource(previous) ||
    previous.kind !== next.kind ||
    previous.sourceProjectId !== next.sourceProjectId ||
    previous.sourceObjective !== next.sourceObjective
  ) {
    return next.sourceObjective;
  }
  return currentObjective;
}

function exactValue(line: string, prefix: string) {
  if (!line.startsWith(prefix)) return "";
  const value = normalizeCustomScriptText(line.slice(prefix.length));
  return value && !value.includes(":") ? value : "";
}

function isOfficialSource(
  value: CustomScriptInputClassification
): value is Extract<CustomScriptInputClassification, { kind: "topic" | "top_pick" }> {
  return value.kind === "topic" || value.kind === "top_pick";
}

function isObjective(value: string): value is CustomScriptObjective {
  return ["auto", "traffic", "trust", "conversion"].includes(value);
}

function invalid(message: string): CustomScriptInputClassification {
  return { kind: "invalid_source", label: "来源格式异常", message };
}
