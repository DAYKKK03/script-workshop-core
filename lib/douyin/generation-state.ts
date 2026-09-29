import { isUsableReferenceTranscript, normalizeReferenceTranscript } from "@/lib/scripts/reference-transcript";

export type GenerationResetScope =
  | "none"
  | "final-only"
  | "reference-and-final";

type ExtractionJobState =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed";

type ExtractionJobResultLike = {
  status: ExtractionJobState;
  originalTranscript?: string | null;
};

export function getSourceResetScope(
  referenceSourceUrl: string,
  nextSourceUrl: string | null
): GenerationResetScope {
  if (!referenceSourceUrl || nextSourceUrl === referenceSourceUrl) {
    return "none";
  }

  return "reference-and-final";
}

export function getGenerationInputResetScope(
  currentValue: string,
  nextValue: string
): GenerationResetScope {
  return currentValue === nextValue ? "none" : "final-only";
}

export function getUsableExtractionTranscript(
  job: ExtractionJobResultLike
) {
  if (job.status !== "succeeded") {
    return undefined;
  }

  const transcript = normalizeReferenceTranscript(job.originalTranscript);

  return isUsableReferenceTranscript(transcript) ? transcript : undefined;
}
