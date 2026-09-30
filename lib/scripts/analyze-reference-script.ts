import {
  extractJsonObject,
  requestDeepSeekJson
} from "@/lib/ai/deepseek";
import { logAnalyzeReferenceFailure } from "@/lib/scripts/analyze-reference-diagnostics";
import {
  isUsableReferenceTranscript,
  normalizeReferenceTranscript,
  resolveReferenceTranscriptInput
} from "@/lib/scripts/reference-transcript";

export type ReferenceScriptSection = {
  title: string;
  originalText: string;
  startTime?: string;
  endTime?: string;
};

export type ReferenceStructureItem = {
  structureName: string;
  originalText: string;
  startTime?: string;
  endTime?: string;
};

export type AnalyzeReferenceScriptResult =
  | {
      status: "success";
      sections: ReferenceScriptSection[];
      referenceStructure: ReferenceStructureItem[];
    }
  | {
      status: "blocked";
      errorCode: "AI_PROVIDER_NOT_CONFIGURED";
      message: string;
    }
  | {
      status: "failed";
      errorCode:
        | "ORIGINAL_TRANSCRIPT_REQUIRED"
        | "REFERENCE_TRANSCRIPT_TOO_SHORT"
        | "AI_PROVIDER_FAILED"
        | "AI_PROVIDER_INVALID_RESPONSE"
        | "INVALID_REFERENCE_STRUCTURE";
      message: string;
    };

export class ReferenceStructureValidationError extends Error {
  constructor(
    public code:
      | "ORIGINAL_TRANSCRIPT_REQUIRED"
      | "REFERENCE_TRANSCRIPT_TOO_SHORT"
      | "INVALID_REFERENCE_STRUCTURE",
    message: string
  ) {
    super(message);
  }
}

const providerNotConfiguredMessage =
  "参考脚本拆解能力暂未配置，请先配置安全可用的 AI 服务";

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, "");
}

function normalizeTranscript(originalTranscript: string) {
  const compact = compactWhitespace(originalTranscript);
  const indexMap: number[] = [];

  for (let index = 0; index < originalTranscript.length; index += 1) {
    if (!/\s/.test(originalTranscript[index])) {
      indexMap.push(index);
    }
  }

  return { compact, indexMap };
}

function findOriginalTextPosition(
  originalTranscript: string,
  normalizedTranscript: ReturnType<typeof normalizeTranscript>,
  originalText: string
) {
  const exactIndex = originalTranscript.indexOf(originalText);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const compactOriginalText = compactWhitespace(originalText);
  const compactIndex = normalizedTranscript.compact.indexOf(compactOriginalText);

  if (compactIndex < 0) {
    return -1;
  }

  return normalizedTranscript.indexMap[compactIndex] ?? -1;
}

export function validateReferenceStructure(
  originalTranscript: string,
  referenceStructure: ReferenceStructureItem[]
) {
  const transcript = normalizeReferenceTranscript(originalTranscript);

  if (!transcript) {
    throw new ReferenceStructureValidationError(
      "ORIGINAL_TRANSCRIPT_REQUIRED",
      "原口播文案不能为空"
    );
  }

  if (!isUsableReferenceTranscript(transcript)) {
    throw new ReferenceStructureValidationError(
      "REFERENCE_TRANSCRIPT_TOO_SHORT",
      "参考口播文案长度不足，暂时无法拆解结构"
    );
  }

  if (!Array.isArray(referenceStructure) || referenceStructure.length === 0) {
    throw new ReferenceStructureValidationError(
      "INVALID_REFERENCE_STRUCTURE",
      "参考脚本拆解至少需要 1 段"
    );
  }

  const normalizedTranscript = normalizeTranscript(transcript);
  let lastPosition = -1;

  referenceStructure.forEach((item, index) => {
    const structureName =
      typeof item.structureName === "string" ? item.structureName.trim() : "";
    const originalText =
      typeof item.originalText === "string" ? item.originalText.trim() : "";

    if (!structureName || !originalText) {
      throw new ReferenceStructureValidationError(
        "INVALID_REFERENCE_STRUCTURE",
        `第 ${index + 1} 段缺少结构名称或原文片段`
      );
    }

    const position = findOriginalTextPosition(
      transcript,
      normalizedTranscript,
      originalText
    );

    if (position < 0) {
      throw new ReferenceStructureValidationError(
        "INVALID_REFERENCE_STRUCTURE",
        `第 ${index + 1} 段原文片段不在原口播文案中`
      );
    }

    if (position < lastPosition) {
      throw new ReferenceStructureValidationError(
        "INVALID_REFERENCE_STRUCTURE",
        "参考脚本拆解顺序必须贴合原文顺序"
      );
    }

    lastPosition = position;
  });
}

function buildAnalyzePrompt(originalTranscript: string) {
  return `你是本地生活短视频编导。

请拆解下面这条自动提取出的抖音口播文案。

要求：
1. 必须严格基于原文拆解。
2. 必须按原文出现顺序拆解。
3. 输出格式必须是 JSON。
4. 输出顶层字段必须是 sections。
5. 每个结构必须包含 title 和 originalText；如果原文有时间信息，可以额外包含 startTime 和 endTime。
6. originalText 必须是原文中的连续或基本连续片段。
7. 不允许脱离原文泛泛总结。
8. 不允许新增原文没有的信息。
9. 不要求固定五段，如果原文结构更多或更少，可以按实际原文拆。
10. title 要贴合短视频脚本功能，例如：开头钩子、痛点引入、场景铺垫、产品介绍、活动说明、信任强化、结尾引导等。

只返回如下 JSON：
{
  "sections": [
    {
      "title": "结构名称",
      "originalText": "原文中的连续或基本连续片段",
      "startTime": "可选",
      "endTime": "可选"
    }
  ]
}

原口播文案：
${originalTranscript}`;
}

function normalizeOptionalTime(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseAnalyzeOutput(content: string) {
  const parsed = JSON.parse(extractJsonObject(content)) as {
    sections?: unknown;
    referenceStructure?: unknown;
  };
  const source = Array.isArray(parsed.sections)
    ? parsed.sections
    : parsed.referenceStructure;

  if (!Array.isArray(source)) {
    throw new Error("sections must be an array");
  }

  const sections = source.map((item) => {
    const value = item as {
      title?: unknown;
      structureName?: unknown;
      originalText?: unknown;
      startTime?: unknown;
      endTime?: unknown;
    };
    const title =
      typeof value.title === "string"
        ? value.title.trim()
        : typeof value.structureName === "string"
          ? value.structureName.trim()
          : "";

    return {
      title,
      originalText:
        typeof value.originalText === "string" ? value.originalText.trim() : "",
      startTime: normalizeOptionalTime(value.startTime),
      endTime: normalizeOptionalTime(value.endTime)
    };
  });
  const referenceStructure = sections.map((section) => ({
    structureName: section.title,
    originalText: section.originalText,
    startTime: section.startTime,
    endTime: section.endTime
  }));

  return {
    sections,
    referenceStructure
  };
}

export async function analyzeReferenceScript(
  originalTranscript: string,
  usageUserId?: string
): Promise<AnalyzeReferenceScriptResult> {
  const transcriptInput = resolveReferenceTranscriptInput(originalTranscript);

  if (transcriptInput.status === "failed") {
    logAnalyzeReferenceFailure({
      errorCode: transcriptInput.errorCode,
      providerSubreason:
        transcriptInput.errorCode === "ORIGINAL_TRANSCRIPT_REQUIRED"
          ? "transcript_empty"
          : "transcript_too_short",
      transcript: originalTranscript,
      userId: usageUserId
    });
    return {
      status: "failed",
      errorCode: transcriptInput.errorCode,
      message: transcriptInput.message
    };
  }

  const transcript = transcriptInput.transcript;

  const deepSeekResult = await requestDeepSeekJson({
    messages: [
      {
        role: "system",
        content: "你只返回合法 JSON，不输出解释、Markdown 或额外字段。"
      },
      {
        role: "user",
        content: buildAnalyzePrompt(transcript)
      }
    ],
    temperature: 0.2,
    usageUserId
  });

  if (deepSeekResult.status === "blocked") {
    logAnalyzeReferenceFailure({
      errorCode: deepSeekResult.errorCode,
      diagnostic: deepSeekResult.diagnostic,
      transcript,
      userId: usageUserId
    });
    return {
      status: "blocked",
      errorCode: "AI_PROVIDER_NOT_CONFIGURED",
      message: providerNotConfiguredMessage
    };
  }

  if (deepSeekResult.status === "failed") {
    logAnalyzeReferenceFailure({
      errorCode: deepSeekResult.errorCode,
      diagnostic: deepSeekResult.diagnostic,
      transcript,
      userId: usageUserId
    });
    return {
      status: "failed",
      errorCode: "AI_PROVIDER_FAILED",
      message: "参考脚本拆解失败，请稍后重试"
    };
  }

  let sectionsCount: number | undefined;

  try {
    const { sections, referenceStructure } = parseAnalyzeOutput(
      deepSeekResult.content
    );
    sectionsCount = sections.length;
    validateReferenceStructure(transcript, referenceStructure);

    return {
      status: "success",
      sections,
      referenceStructure
    };
  } catch (error) {
    if (error instanceof ReferenceStructureValidationError) {
      logAnalyzeReferenceFailure({
        errorCode: error.code,
        providerSubreason:
          error.code === "REFERENCE_TRANSCRIPT_TOO_SHORT"
            ? "transcript_too_short"
            : "schema_invalid",
        transcript,
        sectionsCount,
        userId: usageUserId
      });
      return {
        status: "failed",
        errorCode: error.code,
        message: error.message
      };
    }

    logAnalyzeReferenceFailure({
      errorCode: "AI_PROVIDER_INVALID_RESPONSE",
      providerSubreason: "schema_invalid",
      transcript,
      sectionsCount,
      userId: usageUserId
    });

    return {
      status: "failed",
      errorCode: "AI_PROVIDER_INVALID_RESPONSE",
      message: "参考脚本拆解结果格式不符合要求，请稍后重试"
    };
  }
}
