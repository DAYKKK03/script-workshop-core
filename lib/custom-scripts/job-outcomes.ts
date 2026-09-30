import { hashCustomScriptIdentifier } from "@/lib/custom-scripts/jobs";
import {
  CUSTOM_SCRIPT_LENGTH_BUCKETS,
  CUSTOM_SCRIPT_LINE_COUNT_BUCKETS
} from "@/lib/custom-scripts/length-repair";
import type { SanitizedCustomScriptDiagnostic } from "@/lib/custom-scripts/service-runtime";

type CustomScriptTerminalOutcome =
  | { status: "completed"; event: string }
  | { status: "lease_lost"; event: "custom_script_completion_lost"; errorCode: "CUSTOM_SCRIPT_COMPLETION_LOST" };

export function resolveCustomScriptTerminalOutcome(
  updated: boolean,
  completedEvent: string
): CustomScriptTerminalOutcome {
  return updated
    ? { status: "completed", event: completedEvent }
    : {
        status: "lease_lost",
        event: "custom_script_completion_lost",
        errorCode: "CUSTOM_SCRIPT_COMPLETION_LOST"
      };
}

/** Logs the requested business terminal event only when its conditional write committed. */
export async function persistAndLogCustomScriptTerminal(input: {
  write: () => Promise<boolean>;
  completedEvent: string;
  jobId: string;
  startedAt: number;
  errorCode?: string;
  semanticAttempt: number;
  diagnostic?: SanitizedCustomScriptDiagnostic;
  writeLine?: (line: string) => void;
}) {
  const outcome = resolveCustomScriptTerminalOutcome(await input.write(), input.completedEvent);
  logCustomScriptOutcome(
    outcome.event,
    input.jobId,
    input.startedAt,
    outcome.status === "lease_lost" ? outcome.errorCode : input.errorCode,
    input.semanticAttempt,
    input.diagnostic,
    input.writeLine
  );
  return outcome.status;
}

export function serializeCustomScriptOutcome(input: {
  event: string;
  jobId: string;
  startedAt: number;
  errorCode?: string;
  semanticAttempt: number;
  diagnostic?: SanitizedCustomScriptDiagnostic;
}) {
  const scriptLengthBucket = allowlistedScriptLengthBucket(input.diagnostic?.scriptLengthBucket);
  const scriptLengthDirection = allowlistedScriptLengthDirection(input.diagnostic?.scriptLengthDirection);
  const lineCountBucket = allowlistedLineCountBucket(input.diagnostic?.lineCountBucket);
  return JSON.stringify({
    event: input.event,
    jobHash12: hashCustomScriptIdentifier(input.jobId),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    semanticAttempt: input.semanticAttempt,
    ...(input.diagnostic?.providerSubreason ? { providerSubreason: input.diagnostic.providerSubreason } : {}),
    ...(input.diagnostic?.finishReason ? { finishReason: input.diagnostic.finishReason } : {}),
    ...(input.diagnostic?.responseLengthBucket ? { responseLengthBucket: input.diagnostic.responseLengthBucket } : {}),
    ...(input.diagnostic?.requestPromptLengthBucket ? { requestPromptLengthBucket: input.diagnostic.requestPromptLengthBucket } : {}),
    ...(input.diagnostic?.promptTokensBucket ? { promptTokensBucket: input.diagnostic.promptTokensBucket } : {}),
    ...(input.diagnostic?.completionTokensBucket ? { completionTokensBucket: input.diagnostic.completionTokensBucket } : {}),
    ...(input.diagnostic?.promptCacheHitTokensBucket ? { promptCacheHitTokensBucket: input.diagnostic.promptCacheHitTokensBucket } : {}),
    ...(input.diagnostic?.promptCacheMissTokensBucket ? { promptCacheMissTokensBucket: input.diagnostic.promptCacheMissTokensBucket } : {}),
    ...(input.diagnostic?.thinkingMode ? { thinkingMode: input.diagnostic.thinkingMode } : {}),
    ...(input.diagnostic?.parserReason ? { parserReason: input.diagnostic.parserReason } : {}),
    ...(scriptLengthBucket ? { scriptLengthBucket } : {}),
    ...(scriptLengthDirection ? { scriptLengthDirection } : {}),
    ...(lineCountBucket ? { lineCountBucket } : {}),
    durationMs: Date.now() - input.startedAt
  });
}

export function logCustomScriptOutcome(
  event: string,
  jobId: string,
  startedAt: number,
  errorCode: string | undefined,
  semanticAttempt: number,
  diagnostic?: SanitizedCustomScriptDiagnostic,
  writeLine: (line: string) => void = (line) => process.stdout.write(line)
) {
  writeLine(`${serializeCustomScriptOutcome({ event, jobId, startedAt, errorCode, semanticAttempt, diagnostic })}\n`);
}

function allowlistedScriptLengthBucket(value: unknown) {
  return typeof value === "string" && (CUSTOM_SCRIPT_LENGTH_BUCKETS as readonly string[]).includes(value)
    ? value
    : undefined;
}

function allowlistedScriptLengthDirection(value: unknown) {
  return value === "short" || value === "long" ? value : undefined;
}

function allowlistedLineCountBucket(value: unknown) {
  return typeof value === "string" && (CUSTOM_SCRIPT_LINE_COUNT_BUCKETS as readonly string[]).includes(value)
    ? value
    : undefined;
}
