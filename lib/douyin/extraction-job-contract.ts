import { douyinTranscriptFailureMessage } from "./transcript-constants";
import {
  isUsableReferenceTranscript,
  normalizeReferenceTranscript
} from "../scripts/reference-transcript";

export const extractionTranscriptEmptyErrorCode = "EXTRACTION_TRANSCRIPT_EMPTY";

export type ExtractionJobContractStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed";

export type ExtractionJobContractResult = {
  id: string;
  status: ExtractionJobContractStatus;
  message?: string;
  originalTranscript?: string | null;
};

export function normalizeCompletedExtractionTranscript(
  transcript: string | null | undefined
) {
  const normalized = normalizeReferenceTranscript(transcript);
  return isUsableReferenceTranscript(normalized) ? normalized : undefined;
}

export function resolveExtractionCompletion(
  transcript: string | null | undefined
) {
  const normalizedTranscript = normalizeCompletedExtractionTranscript(transcript);

  if (normalizedTranscript) {
    return {
      status: "succeeded" as const,
      originalTranscript: normalizedTranscript
    };
  }

  return {
    status: "failed" as const,
    errorCode: extractionTranscriptEmptyErrorCode
  };
}

export function normalizeExtractionJobTerminalResult(
  job: ExtractionJobContractResult,
  failureMessage = douyinTranscriptFailureMessage
): ExtractionJobContractResult {
  if (job.status === "succeeded") {
    const normalizedTranscript = normalizeCompletedExtractionTranscript(
      job.originalTranscript
    );

    if (normalizedTranscript) {
      return {
        id: job.id,
        status: "succeeded",
        originalTranscript: normalizedTranscript
      };
    }

    return {
      id: job.id,
      status: "failed",
      message: job.message || failureMessage
    };
  }

  if (job.status === "failed") {
    return {
      id: job.id,
      status: "failed",
      message: job.message || failureMessage
    };
  }

  return {
    id: job.id,
    status: job.status
  };
}
