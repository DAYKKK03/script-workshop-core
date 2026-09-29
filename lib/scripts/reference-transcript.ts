export const minimumReferenceTranscriptLength = 40;
export const minimumReferenceTranscriptSegments = 2;

export type ReferenceTranscriptInputResult =
  | {
      status: "success";
      transcript: string;
    }
  | {
      status: "failed";
      errorCode: "ORIGINAL_TRANSCRIPT_REQUIRED" | "REFERENCE_TRANSCRIPT_TOO_SHORT";
      message: string;
    };

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function countMeaningfulSegments(value: string) {
  return normalizeWhitespace(value)
    .split(/[。！？!?；;，,、\n\r]+/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 4).length;
}

export function normalizeReferenceTranscript(value: string | null | undefined) {
  return typeof value === "string" ? normalizeWhitespace(value) : "";
}

export function isUsableReferenceTranscript(
  value: string | null | undefined
) {
  const transcript = normalizeReferenceTranscript(value);

  if (!transcript) {
    return false;
  }

  const nonWhitespaceLength = transcript.replace(/\s+/g, "").length;

  if (nonWhitespaceLength < minimumReferenceTranscriptLength) {
    return false;
  }

  return countMeaningfulSegments(transcript) >= minimumReferenceTranscriptSegments;
}

export function resolveReferenceTranscriptInput(
  value: string | null | undefined
): ReferenceTranscriptInputResult {
  const transcript = normalizeReferenceTranscript(value);

  if (!transcript) {
    return {
      status: "failed",
      errorCode: "ORIGINAL_TRANSCRIPT_REQUIRED",
      message: "原口播文案不能为空"
    };
  }

  if (!isUsableReferenceTranscript(transcript)) {
    return {
      status: "failed",
      errorCode: "REFERENCE_TRANSCRIPT_TOO_SHORT",
      message: "参考脚本拆解失败，请稍后重试"
    };
  }

  return {
    status: "success",
    transcript
  };
}
