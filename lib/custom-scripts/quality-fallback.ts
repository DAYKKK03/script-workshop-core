import type { CustomScriptInputType } from "@/lib/custom-scripts/contracts";
import { shouldAttemptCustomScriptQualityEnrichment } from "@/lib/custom-scripts/length-repair";
import {
  countCustomScriptCodePoints,
  normalizeCustomScriptText
} from "@/lib/custom-scripts/text";

export type CustomScriptQualityFallback = {
  status: "quality_fallback";
  finalScript: string;
  characterCount: number;
  inputType: CustomScriptInputType;
};

const inputTypes = new Set<CustomScriptInputType>(["brief", "topic", "top_pick"]);
const fallbackKeys = ["characterCount", "finalScript", "inputType", "status"];

/** Creates the private recovery record only after the script passed domain validation. */
export function createCustomScriptQualityFallback(
  finalScript: string,
  inputType: CustomScriptInputType
): CustomScriptQualityFallback {
  const normalized = normalizeCustomScriptText(finalScript);
  const characterCount = countCustomScriptCodePoints(normalized);
  if (!shouldAttemptCustomScriptQualityEnrichment(characterCount)) {
    throw new Error("Custom script quality fallback is outside the recoverable range");
  }
  return { status: "quality_fallback", finalScript: normalized, characterCount, inputType };
}

/** Strict parsing prevents malformed or stale internal JSON from becoming user-visible output. */
export function parseCustomScriptQualityFallback(value: unknown): CustomScriptQualityFallback | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join("|") !== fallbackKeys.join("|")) return undefined;
  if (
    candidate.status !== "quality_fallback"
    || typeof candidate.finalScript !== "string"
    || typeof candidate.characterCount !== "number"
    || !Number.isInteger(candidate.characterCount)
    || typeof candidate.inputType !== "string"
    || !inputTypes.has(candidate.inputType as CustomScriptInputType)
  ) return undefined;

  const normalized = normalizeCustomScriptText(candidate.finalScript);
  if (normalized !== candidate.finalScript) return undefined;
  const characterCount = countCustomScriptCodePoints(normalized);
  if (
    characterCount !== candidate.characterCount
    || !shouldAttemptCustomScriptQualityEnrichment(characterCount)
  ) return undefined;
  return candidate as CustomScriptQualityFallback;
}
