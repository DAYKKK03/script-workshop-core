import {
  extractJsonObject,
  requestDeepSeekJson
} from "@/lib/ai/deepseek";
import { getProjectForUser } from "@/lib/projects/service";
import type { ReferenceStructureItem } from "@/lib/scripts/analyze-reference-script";
import { formatFinalScript } from "@/lib/scripts/format-final-script";
import {
  assertDailyScriptQuota,
  DailyScriptLimitError,
  recordSuccessfulScript
} from "@/lib/usage/service";

export type ScriptDuration = "15-30" | "30-60" | "60-90";

export type GenerateFinalScriptResult =
  | {
      status: "success";
      finalScript: string;
    }
  | {
      status: "blocked";
      errorCode: "AI_PROVIDER_NOT_CONFIGURED";
      message: string;
    }
  | {
      status: "failed";
      errorCode:
        | "PROJECT_ID_REQUIRED"
        | "PROJECT_NOT_FOUND"
        | "PROJECT_PROFILE_REQUIRED"
        | "INVALID_DURATION"
        | "INVALID_REFERENCE_STRUCTURE"
        | "DAILY_SCRIPT_LIMIT_REACHED"
        | "AI_PROVIDER_FAILED"
        | "AI_PROVIDER_INVALID_RESPONSE"
        | "INVALID_FINAL_SCRIPT";
      message: string;
    };

export class FinalScriptValidationError extends Error {
  constructor(
    public code:
      | "PROJECT_ID_REQUIRED"
      | "PROJECT_NOT_FOUND"
      | "PROJECT_PROFILE_REQUIRED"
      | "INVALID_DURATION"
      | "INVALID_REFERENCE_STRUCTURE"
      | "INVALID_FINAL_SCRIPT",
    message: string,
    public details?: {
      currentLength?: number;
      minLength?: number;
      maxLength?: number;
      durationLabel?: string;
    }
  ) {
    super(message);
  }
}

const durations: ScriptDuration[] = ["15-30", "30-60", "60-90"];

const durationWordRanges: Record<
  ScriptDuration,
  { min: number; max: number; label: string }
> = {
  "15-30": { min: 80, max: 150, label: "15-30 秒" },
  "30-60": { min: 180, max: 300, label: "30-60 秒" },
  "60-90": { min: 320, max: 500, label: "60-90 秒" }
};

const durationPromptGuidance: Record<ScriptDuration, string> = {
  "15-30": "请写 3-5 个短句，目标 90-130 个中文字符。",
  "30-60": "请写 9-11 个短句，目标 240-300 个中文字符。",
  "60-90": "请写 14-18 个口播句，目标 360-430 个中文字符；每句保持口语化，但不要过短。"
};

const providerNotConfiguredMessage =
  "完整口播文案生成能力暂未配置，请先配置安全可用的 AI 服务";

export function isScriptDuration(value: unknown): value is ScriptDuration {
  return typeof value === "string" && durations.includes(value as ScriptDuration);
}

export function validateFinalScriptInput(input: {
  projectId: unknown;
  duration: unknown;
  referenceStructure: unknown;
}) {
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";

  if (!projectId) {
    throw new FinalScriptValidationError("PROJECT_ID_REQUIRED", "请选择商家项目");
  }

  if (!isScriptDuration(input.duration)) {
    throw new FinalScriptValidationError("INVALID_DURATION", "脚本时长不合法");
  }

  if (
    !Array.isArray(input.referenceStructure) ||
    input.referenceStructure.length === 0 ||
    input.referenceStructure.length > 20
  ) {
    throw new FinalScriptValidationError(
      "INVALID_REFERENCE_STRUCTURE",
      "参考脚本结构需要 1-20 段"
    );
  }

  const referenceStructure = input.referenceStructure.map((item, index) => {
    const value = item as {
      structureName?: unknown;
      originalText?: unknown;
    };
    const structureName =
      typeof value.structureName === "string" ? value.structureName.trim() : "";
    const originalText =
      typeof value.originalText === "string" ? value.originalText.trim() : "";

    if (!structureName || !originalText) {
      throw new FinalScriptValidationError(
        "INVALID_REFERENCE_STRUCTURE",
        `第 ${index + 1} 段缺少结构名称或原文片段`
      );
    }

    if (structureName.length > 100 || originalText.length > 5000) {
      throw new FinalScriptValidationError(
        "INVALID_REFERENCE_STRUCTURE",
        `第 ${index + 1} 段内容超出长度限制`
      );
    }

    return { structureName, originalText };
  });

  return {
    projectId,
    duration: input.duration,
    referenceStructure
  };
}

function normalizeScriptLength(value: string) {
  return value.replace(/\s+/g, "").length;
}

function compactText(value: string) {
  return value.replace(/\s+/g, "");
}

function validateFinalScriptLength(finalScript: string, duration: ScriptDuration) {
  const range = durationWordRanges[duration];
  const length = normalizeScriptLength(finalScript);
  const minTolerance = duration === "60-90" ? 0.9 : 0.8;
  const minWithTolerance = Math.floor(range.min * minTolerance);
  const maxWithTolerance = Math.ceil(range.max * 1.15);

  if (length < minWithTolerance || length > maxWithTolerance) {
    throw new FinalScriptValidationError(
      "INVALID_FINAL_SCRIPT",
      `生成的口播文案长度不符合 ${range.label} 要求，请稍后重试`,
      {
        currentLength: length,
        minLength: minWithTolerance,
        maxLength: maxWithTolerance,
        durationLabel: range.label
      }
    );
  }
}

function validateFinalScriptDoesNotCopyReference(
  finalScript: string,
  referenceStructure: ReferenceStructureItem[]
) {
  const compactScript = compactText(finalScript);

  referenceStructure.forEach((item, index) => {
    const compactOriginalText = compactText(item.originalText);

    if (
      compactOriginalText.length >= 12 &&
      compactScript.includes(compactOriginalText)
    ) {
      throw new FinalScriptValidationError(
        "INVALID_FINAL_SCRIPT",
        `生成的口播文案不应直接复制第 ${index + 1} 段参考原文，请稍后重试`
      );
    }
  });
}

function parseFinalScript(
  content: string,
  duration: ScriptDuration,
  referenceStructure: ReferenceStructureItem[]
) {
  const parsed = JSON.parse(extractJsonObject(content)) as {
    finalScript?: unknown;
  };
  const finalScript =
    typeof parsed.finalScript === "string"
      ? formatFinalScript(parsed.finalScript)
      : "";

  if (!finalScript) {
    throw new FinalScriptValidationError(
      "INVALID_FINAL_SCRIPT",
      "生成的口播文案为空"
    );
  }

  validateFinalScriptLength(finalScript, duration);
  validateFinalScriptDoesNotCopyReference(finalScript, referenceStructure);

  return finalScript;
}

function buildPrompt(input: {
  referenceStructure: ReferenceStructureItem[];
  projectProfileText: string;
  duration: ScriptDuration;
  retryInstruction?: string;
}) {
  const range = durationWordRanges[input.duration];
  const shortReferenceGuidance =
    input.duration === "60-90" && input.referenceStructure.length < 3
      ? "\n补充要求：参考结构段数较少时，仍保持原结构功能顺序，但要围绕商家资料扩展足够的口播细节，包括到店场景、菜品体验、适合人群、服务/环境感受和结尾行动引导；不要只写一两句概括。\n"
      : "";
  const retryInstruction = input.retryInstruction
    ? `\n额外修正要求：${input.retryInstruction}\n`
    : "";

  return `你是本地生活短视频口播脚本编导。

请根据参考脚本结构和商家项目资料，直接生成一条完整口播文案。

要求：
1. 必须参考 referenceStructure 的顺序和每段表达功能。
2. 最终文案内容必须来自商家项目资料。
3. 不允许复制 referenceStructure.originalText 的原句。
4. 不允许沿用参考视频原商家的店名、地址、菜品、套餐、活动、卖点。
5. 不允许虚构项目资料中没有的具体价格、活动、地址、资质、承诺。
6. 可以围绕商家资料里的位置、菜品、适合人群、用餐场景、体验感受做口语化展开，但不得新增资料外的具体信息。
7. 语言口语化，适合抖音本地生活短视频。
8. 时长为 ${range.label}，最终文案必须控制在 ${range.min}-${range.max} 个中文字符之间，少于 ${range.min} 或多于 ${range.max} 都会被系统拒绝。
9. ${durationPromptGuidance[input.duration]}
10. 不要输出提纲、标题或解释，直接输出可复制的完整口播文案。
11. 不允许直接复制 referenceStructure.originalText 的完整句子或长片段。
12. finalScript 必须按“一个完整口播句子一行”排版；只在句号、问号、感叹号及对应中英文标点后换行，不要在逗号后强制换行。原本有明确段落时，段落之间只保留一个空行。
13. 不要主动给每行添加序号、项目符号或额外标题。
14. 输出 JSON，只包含 finalScript。
${shortReferenceGuidance}
${retryInstruction}

商家项目资料：
${input.projectProfileText}

参考脚本结构：
${JSON.stringify(input.referenceStructure, null, 2)}

只返回如下 JSON：
{
  "finalScript": "第一句完整口播。\\n第二句完整口播！"
}`;
}

function getFinalScriptRetryInstruction(error: FinalScriptValidationError) {
  if (error.code !== "INVALID_FINAL_SCRIPT") {
    return "";
  }

  if (
    typeof error.details?.currentLength === "number" &&
    typeof error.details.minLength === "number" &&
    typeof error.details.maxLength === "number"
  ) {
    const direction =
      error.details.currentLength < error.details.minLength ? "偏短" : "偏长";
    const longDurationGuidance =
      error.details.durationLabel === "60-90 秒" &&
      error.details.currentLength < error.details.minLength
        ? "60-90 秒版本不要写成短视频简介；请扩成完整口播，至少包含开头到店理由、附近人群/用餐场景、2-3 个菜品或体验细节、环境/服务感受、适合谁来吃、结尾行动引导。每一点用自然口语展开，但只能使用商家项目资料中的信息，不得编造价格、活动或承诺。"
        : "";

    return `上一次生成${direction}，实际约 ${error.details.currentLength} 个中文字符，目标是 ${error.details.minLength}-${error.details.maxLength} 个中文字符。请重新生成：必须严格落在目标范围内；如果偏短，请围绕商家资料里的用餐场景、适合人群、菜品体验、到店理由和行动引导做口语化展开；如果偏长，请压缩表达；避免复制参考原文长片段，只使用商家项目资料中的信息。${longDurationGuidance}`;
  }

  return "上一次生成未通过质量校验。请重新生成：必须严格落在所选时长字数范围内；如果偏短，请围绕商家资料里的用餐场景、适合人群、菜品体验和到店理由做口语化展开；如果偏长，请压缩表达；避免复制参考原文长片段，只使用商家项目资料中的信息。";
}

async function requestAndParseFinalScript(input: {
  referenceStructure: ReferenceStructureItem[];
  projectProfileText: string;
  duration: ScriptDuration;
  userId: string;
}) {
  let retryInstruction = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const deepSeekResult = await requestDeepSeekJson({
      messages: [
        {
          role: "system",
          content: "你只返回合法 JSON，不输出解释、Markdown 或额外字段。"
        },
        {
          role: "user",
          content: buildPrompt({
            referenceStructure: input.referenceStructure,
            projectProfileText: input.projectProfileText,
            duration: input.duration,
            retryInstruction
          })
        }
      ],
      temperature: 0.4,
      usageUserId: input.userId
    });

    if (deepSeekResult.status !== "success") {
      return deepSeekResult;
    }

    try {
      return {
        status: "success" as const,
        finalScript: parseFinalScript(
          deepSeekResult.content,
          input.duration,
          input.referenceStructure
        )
      };
    } catch (error) {
      if (error instanceof FinalScriptValidationError && attempt < 2) {
        retryInstruction = getFinalScriptRetryInstruction(error);

        if (retryInstruction) {
          continue;
        }
      }

      throw error;
    }
  }

  throw new FinalScriptValidationError(
    "INVALID_FINAL_SCRIPT",
    "完整口播文案生成失败，请稍后重试"
  );
}

export async function generateFinalScript(input: {
  userId: string;
  projectId: unknown;
  referenceStructure: unknown;
  duration: unknown;
}): Promise<GenerateFinalScriptResult> {
  try {
    const validatedInput = validateFinalScriptInput(input);
    const project = await getProjectForUser(validatedInput.projectId, input.userId);

    if (!project) {
      return {
        status: "failed",
        errorCode: "PROJECT_NOT_FOUND",
        message: "项目不存在"
      };
    }

    const projectProfileText = project.profileText.trim();

    if (!projectProfileText) {
      return {
        status: "failed",
        errorCode: "PROJECT_PROFILE_REQUIRED",
        message: "店铺资料不能为空"
      };
    }

    await assertDailyScriptQuota(input.userId);

    const finalScriptResult = await requestAndParseFinalScript({
      referenceStructure: validatedInput.referenceStructure,
      projectProfileText,
      duration: validatedInput.duration,
      userId: input.userId
    });

    if (finalScriptResult.status === "blocked") {
      return {
        status: "blocked",
        errorCode: "AI_PROVIDER_NOT_CONFIGURED",
        message: providerNotConfiguredMessage
      };
    }

    if (finalScriptResult.status === "failed") {
      return {
        status: "failed",
        errorCode: "AI_PROVIDER_FAILED",
        message: "完整口播文案生成失败，请稍后重试"
      };
    }

    await recordSuccessfulScript(input.userId);

    return {
      status: "success",
      finalScript: finalScriptResult.finalScript
    };
  } catch (error) {
    if (error instanceof DailyScriptLimitError) {
      return {
        status: "failed",
        errorCode: "DAILY_SCRIPT_LIMIT_REACHED",
        message: `今日生成额度已用完（${error.limit} 条），请明日再试`
      };
    }
    if (error instanceof FinalScriptValidationError) {
      return {
        status: "failed",
        errorCode: error.code,
        message: error.message
      };
    }

    return {
      status: "failed",
      errorCode: "AI_PROVIDER_INVALID_RESPONSE",
      message: "完整口播文案生成结果格式不符合要求，请稍后重试"
    };
  }
}
