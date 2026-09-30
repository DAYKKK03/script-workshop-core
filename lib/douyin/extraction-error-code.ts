import type { ExtractionFailureDiagnostic } from "@/lib/douyin/diagnostics";

const asrSubmitFailureReasonSet = new Set([
  "submit_endpoint_invalid",
  "submit_endpoint_not_found",
  "submit_auth_rejected",
  "submit_rate_limited",
  "submit_provider_unavailable",
  "submit_unsupported_media",
  "submit_request_rejected",
  "submit_timeout",
  "submit_network",
  "submit_invalid_response",
  "unknown_submit_failure"
] as const);

const asrSubmitFailureSeparator = "__";
const asrSubmitFailureBaseCode = "ASR_SUBMIT_FAILED";

const extractionDiagnosticFieldMap = {
  failureReason: "fr",
  selectedMediaKind: "smk",
  selectedMediaFormat: "smf",
  selectedMediaPath: "smp",
  candidateCount: "cc",
  candidateKinds: "ck",
  candidateFormats: "cf",
  candidatePaths: "cp"
} as const;

type ExtractionDiagnosticFieldKey = keyof typeof extractionDiagnosticFieldMap;

export type SafeAsrSubmitFailureReason = Extract<
  ExtractionFailureDiagnostic["failureReason"],
  string
> | "unknown_submit_failure";

export type ParsedExtractionErrorCode = {
  rawCode: string | null;
  baseCode: string | null;
  safeDetail: SafeAsrSubmitFailureReason | null;
  selectedMediaKind: string | null;
  selectedMediaFormat: string | null;
  selectedMediaPath: string | null;
  candidateCount: number | null;
  candidateKinds: string | null;
  candidateFormats: string | null;
  candidatePaths: string | null;
};

export function encodeExtractionErrorCode({
  errorCode,
  diagnostic
}: {
  errorCode: string;
  diagnostic?:
    | Pick<
        ExtractionFailureDiagnostic,
        | "provider"
        | "failureReason"
        | "selectedMediaKind"
        | "selectedMediaFormat"
        | "selectedMediaPath"
        | "candidateCount"
        | "candidateKinds"
        | "candidateFormats"
        | "candidatePaths"
      >
    | undefined;
}) {
  if (errorCode !== asrSubmitFailureBaseCode || diagnostic?.provider !== "asr") {
    return errorCode;
  }

  const safeReason = isSafeAsrSubmitFailureReason(diagnostic.failureReason)
    ? diagnostic.failureReason
    : undefined;

  if (
    !safeReason &&
    !diagnostic.selectedMediaKind &&
    !diagnostic.selectedMediaFormat &&
    !diagnostic.selectedMediaPath &&
    !Number.isFinite(diagnostic.candidateCount) &&
    !diagnostic.candidateKinds &&
    !diagnostic.candidateFormats &&
    !diagnostic.candidatePaths
  ) {
    return errorCode;
  }

  const segments = [
    buildDiagnosticSegment("failureReason", safeReason),
    buildDiagnosticSegment("selectedMediaKind", diagnostic.selectedMediaKind),
    buildDiagnosticSegment("selectedMediaFormat", diagnostic.selectedMediaFormat),
    buildDiagnosticSegment("selectedMediaPath", diagnostic.selectedMediaPath),
    buildDiagnosticSegment(
      "candidateCount",
      Number.isFinite(diagnostic.candidateCount)
        ? String(diagnostic.candidateCount)
        : undefined
    ),
    buildDiagnosticSegment("candidateKinds", diagnostic.candidateKinds),
    buildDiagnosticSegment("candidateFormats", diagnostic.candidateFormats),
    buildDiagnosticSegment("candidatePaths", diagnostic.candidatePaths)
  ].filter(Boolean);

  if (segments.length === 0) {
    return errorCode;
  }

  return [errorCode, ...segments].join(asrSubmitFailureSeparator);
}

export function parseExtractionErrorCode(
  errorCode: string | null | undefined
): ParsedExtractionErrorCode {
  if (!errorCode) {
    return emptyParsedExtractionErrorCode();
  }

  if (!errorCode.startsWith(`${asrSubmitFailureBaseCode}${asrSubmitFailureSeparator}`)) {
    return {
      ...emptyParsedExtractionErrorCode(),
      rawCode: errorCode,
      baseCode: errorCode
    };
  }

  const encodedSegments = errorCode
    .slice(`${asrSubmitFailureBaseCode}${asrSubmitFailureSeparator}`.length)
    .split(asrSubmitFailureSeparator)
    .filter(Boolean);

  if (encodedSegments.length === 1 && !encodedSegments[0].includes("=")) {
    return {
      ...emptyParsedExtractionErrorCode(),
      rawCode: errorCode,
      baseCode: asrSubmitFailureBaseCode,
      safeDetail: isSafeAsrSubmitFailureReason(encodedSegments[0])
        ? encodedSegments[0]
        : "unknown_submit_failure"
    };
  }

  const values = new Map<string, string>();

  for (const segment of encodedSegments) {
    const separatorIndex = segment.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    const key = segment.slice(0, separatorIndex);
    const value = segment.slice(separatorIndex + 1);
    values.set(key, safeDecodeURIComponent(value));
  }

  const safeDetail = values.get(extractionDiagnosticFieldMap.failureReason);

  return {
    rawCode: errorCode,
    baseCode: asrSubmitFailureBaseCode,
    safeDetail: isSafeAsrSubmitFailureReason(safeDetail)
      ? safeDetail
      : safeDetail
        ? "unknown_submit_failure"
        : null,
    selectedMediaKind:
      values.get(extractionDiagnosticFieldMap.selectedMediaKind) || null,
    selectedMediaFormat:
      values.get(extractionDiagnosticFieldMap.selectedMediaFormat) || null,
    selectedMediaPath:
      values.get(extractionDiagnosticFieldMap.selectedMediaPath) || null,
    candidateCount: parsePositiveInteger(
      values.get(extractionDiagnosticFieldMap.candidateCount)
    ),
    candidateKinds:
      values.get(extractionDiagnosticFieldMap.candidateKinds) || null,
    candidateFormats:
      values.get(extractionDiagnosticFieldMap.candidateFormats) || null,
    candidatePaths:
      values.get(extractionDiagnosticFieldMap.candidatePaths) || null
  };
}

export function getExtractionErrorBaseCode(errorCode: string | null | undefined) {
  return parseExtractionErrorCode(errorCode).baseCode;
}

function emptyParsedExtractionErrorCode(): ParsedExtractionErrorCode {
  return {
    rawCode: null,
    baseCode: null,
    safeDetail: null,
    selectedMediaKind: null,
    selectedMediaFormat: null,
    selectedMediaPath: null,
    candidateCount: null,
    candidateKinds: null,
    candidateFormats: null,
    candidatePaths: null
  };
}

function buildDiagnosticSegment(
  field: ExtractionDiagnosticFieldKey,
  value: string | undefined
) {
  if (!value) {
    return undefined;
  }

  return `${extractionDiagnosticFieldMap[field]}=${encodeURIComponent(value)}`;
}

function parsePositiveInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isSafeAsrSubmitFailureReason(
  value: string | null | undefined
): value is SafeAsrSubmitFailureReason {
  return Boolean(value && asrSubmitFailureReasonSet.has(value as SafeAsrSubmitFailureReason));
}
