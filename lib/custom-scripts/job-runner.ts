import { Prisma } from "@prisma/client";
import { countCustomScriptCodePoints } from "@/lib/custom-scripts/text";
import {
  shouldAttemptCustomScriptQualityEnrichment,
  shouldUseCustomScriptQualityCandidate,
  validateCustomScriptRequestBody,
  type CustomScriptRepair,
  type ValidatedCustomScriptInput
} from "@/lib/custom-scripts/contracts";
import { withCustomScriptHeartbeat } from "@/lib/custom-scripts/job-heartbeat";
import { logCustomScriptOutcome, persistAndLogCustomScriptTerminal } from "@/lib/custom-scripts/job-outcomes";
import {
  CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT,
  CUSTOM_SCRIPT_QUALITY_REQUIRED_REMAINING_MS,
  customScriptQualityProviderTimeoutMs
} from "@/lib/custom-scripts/job-policy";
import {
  completeCustomScriptNeedsProfile,
  completeCustomScriptSuccess,
  customScriptJobIsOwned,
  failCustomScriptJob,
  persistCustomScriptQualityFallback
} from "@/lib/custom-scripts/jobs";
import {
  createCustomScriptQualityFallback,
  parseCustomScriptQualityFallback
} from "@/lib/custom-scripts/quality-fallback";
import {
  requestCustomScriptAttempt,
  type CustomScriptProvider,
  type SanitizedCustomScriptDiagnostic
} from "@/lib/custom-scripts/service-runtime";
import { prisma } from "@/lib/prisma";
import { getProjectForUser } from "@/lib/projects/service";

export async function processClaimedCustomScriptJob(
  jobId: string,
  leaseToken: string,
  provider?: CustomScriptProvider,
  writeLine: (line: string) => void = (line) => process.stdout.write(line)
) {
  const startedAt = Date.now();
  const job = await prisma.customScriptGenerationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      userId: true,
      projectId: true,
      status: true,
      input: true,
      lockedBy: true,
      runDeadlineAt: true,
      providerCallsStarted: true,
      result: true
    }
  });
  if (!job || job.status !== "processing" || job.lockedBy !== leaseToken) return;
  const persistTerminal = (
    write: () => Promise<boolean>,
    completedEvent: string,
    errorCode: string | undefined,
    semanticAttempt: number,
    diagnostic?: SanitizedCustomScriptDiagnostic
  ) => persistAndLogCustomScriptTerminal({
    write,
    completedEvent,
    jobId: job.id,
    startedAt,
    errorCode,
    semanticAttempt,
    diagnostic,
    writeLine
  });
  if (job.runDeadlineAt <= new Date()) {
    await persistTerminal(
      () => failCustomScriptJob(job.id, leaseToken, "CUSTOM_SCRIPT_RUN_TIMEOUT"),
      "custom_script_failed",
      "CUSTOM_SCRIPT_RUN_TIMEOUT",
      job.providerCallsStarted
    );
    return;
  }
  const validated = parseStoredInput(job.input);
  if (!validated || !job.projectId || validated.projectId !== job.projectId) {
    await persistTerminal(
      () => failCustomScriptJob(job.id, leaseToken, "CUSTOM_SCRIPT_INPUT_INVALID"),
      "custom_script_failed",
      "CUSTOM_SCRIPT_INPUT_INVALID",
      job.providerCallsStarted
    );
    return;
  }
  const project = await getProjectForUser(job.projectId, job.userId);
  if (!project) {
    await persistTerminal(
      () => failCustomScriptJob(job.id, leaseToken, "PROJECT_NOT_FOUND"),
      "custom_script_failed",
      "PROJECT_NOT_FOUND",
      job.providerCallsStarted
    );
    return;
  }

  const storedFallback = job.providerCallsStarted >= 1
    && job.providerCallsStarted <= CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT
    ? parseCustomScriptQualityFallback(job.result)
    : undefined;
  let lastRepair: CustomScriptRepair | undefined = storedFallback && job.providerCallsStarted < CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT
    ? { reason: "quality_enrichment", repairMode: "fresh" }
    : undefined;
  let lastDiagnostic: SanitizedCustomScriptDiagnostic | undefined;
  let lastSemanticAttempt = job.providerCallsStarted;
  let terminalOutcomeRecorded = false;
  let firstSafeSuccess: {
    finalScript: string;
    characterCount: number;
    semanticAttempt: number;
    diagnostic: SanitizedCustomScriptDiagnostic;
  } | undefined = storedFallback ? {
    finalScript: storedFallback.finalScript,
    characterCount: storedFallback.characterCount,
    semanticAttempt: job.providerCallsStarted,
    diagnostic: {}
  } : undefined;
  const completeSuccess = async (input: {
    finalScript: string;
    characterCount: number;
    semanticAttempt: number;
    diagnostic: SanitizedCustomScriptDiagnostic;
  }) => {
    const result = {
      status: "success",
      finalScript: input.finalScript,
      characterCount: input.characterCount,
      inputType: validated.inputType
    } satisfies Prisma.InputJsonObject;
    const completionOutcome = await completeCustomScriptSuccess({
      jobId: job.id,
      userId: job.userId,
      leaseToken,
      result
    });
    terminalOutcomeRecorded = true;
    if (completionOutcome === "completed") {
      logCustomScriptOutcome("custom_script_succeeded", job.id, startedAt, undefined, input.semanticAttempt, input.diagnostic, writeLine);
    } else if (completionOutcome === "daily_limit") {
      logCustomScriptOutcome(
        "custom_script_failed",
        job.id,
        startedAt,
        "CUSTOM_SCRIPT_DAILY_LIMIT_REACHED",
        input.semanticAttempt,
        input.diagnostic,
        writeLine
      );
    } else {
      logCustomScriptOutcome(
        "custom_script_completion_lost",
        job.id,
        startedAt,
        "CUSTOM_SCRIPT_COMPLETION_LOST",
        input.semanticAttempt,
        input.diagnostic,
        writeLine
      );
    }
  };
  const heartbeatOutcome = await withCustomScriptHeartbeat(job.id, leaseToken, async (lease) => {
    if (firstSafeSuccess && job.providerCallsStarted === CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT) {
      if (!(await lease.canContinue()) || !(await customScriptJobIsOwned(job.id, leaseToken))) return;
      await completeSuccess(firstSafeSuccess);
      return;
    }
    for (let semanticAttempt = job.providerCallsStarted + 1; semanticAttempt <= CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT; semanticAttempt += 1) {
      lastSemanticAttempt = semanticAttempt;
      if (!(await lease.canContinue())) return;
      const remainingBeforeReservationMs = job.runDeadlineAt.getTime() - Date.now();
      if (firstSafeSuccess && customScriptQualityProviderTimeoutMs(remainingBeforeReservationMs) <= 0) {
        if (!(await customScriptJobIsOwned(job.id, leaseToken))) return;
        await completeSuccess(firstSafeSuccess);
        return;
      }
      const reserved = await reserveProviderCall(
        job.id,
        leaseToken,
        semanticAttempt,
        firstSafeSuccess ? CUSTOM_SCRIPT_QUALITY_REQUIRED_REMAINING_MS : 0
      );
      if (!reserved) {
        if (
          firstSafeSuccess
          && await lease.canContinue()
          && await customScriptJobIsOwned(job.id, leaseToken)
        ) {
          await completeSuccess(firstSafeSuccess);
          return;
        }
        terminalOutcomeRecorded = true;
        logCustomScriptOutcome("custom_script_completion_lost", job.id, startedAt, "CUSTOM_SCRIPT_COMPLETION_LOST", semanticAttempt, undefined, writeLine);
        return;
      }
      const remainingMs = job.runDeadlineAt.getTime() - Date.now();
      if (remainingMs <= 0) {
        if (!(await lease.canContinue())) return;
        terminalOutcomeRecorded = true;
        await persistTerminal(
          () => failCustomScriptJob(job.id, leaseToken, "CUSTOM_SCRIPT_RUN_TIMEOUT"),
          "custom_script_failed",
          "CUSTOM_SCRIPT_RUN_TIMEOUT",
          semanticAttempt
        );
        return;
      }
      const attempt = await requestCustomScriptAttempt({
        userId: job.userId,
        merchantProjectName: project.projectName,
        merchantProfileText: project.profileText,
        requestText: validated.requestText,
        objective: validated.objective,
        tone: validated.tone,
        previousScript: validated.previousScript,
        repair: lastRepair,
        timeoutMs: firstSafeSuccess
          ? Math.max(1, customScriptQualityProviderTimeoutMs(remainingMs))
          : remainingMs
      }, provider);
      lastDiagnostic = attempt.diagnostic;
      if (Date.now() >= job.runDeadlineAt.getTime()) {
        if (!(await lease.canContinue())) return;
        terminalOutcomeRecorded = true;
        await persistTerminal(
          () => failCustomScriptJob(job.id, leaseToken, "CUSTOM_SCRIPT_RUN_TIMEOUT"),
          "custom_script_failed",
          "CUSTOM_SCRIPT_RUN_TIMEOUT",
          semanticAttempt,
          attempt.diagnostic
        );
        return;
      }
      if (!(await lease.canContinue()) || !(await customScriptJobIsOwned(job.id, leaseToken))) {
        terminalOutcomeRecorded = true;
        logCustomScriptOutcome(
          "custom_script_completion_lost",
          job.id,
          startedAt,
          "CUSTOM_SCRIPT_COMPLETION_LOST",
          semanticAttempt,
          attempt.diagnostic,
          writeLine
        );
        return;
      }
      if (attempt.status === "provider_failed") {
        if (firstSafeSuccess) {
          await completeSuccess({
            ...firstSafeSuccess,
            semanticAttempt,
            diagnostic: attempt.diagnostic
          });
          return;
        }
        terminalOutcomeRecorded = true;
        await persistTerminal(
          () => failCustomScriptJob(job.id, leaseToken, attempt.errorCode),
          "custom_script_failed",
          attempt.errorCode,
          semanticAttempt,
          attempt.diagnostic
        );
        return;
      }
      if (attempt.status === "invalid") {
        logCustomScriptOutcome(
          "custom_script_validation_invalid",
          job.id,
          startedAt,
          undefined,
          semanticAttempt,
          attempt.diagnostic,
          writeLine
        );
        if (firstSafeSuccess) {
          await completeSuccess({
            ...firstSafeSuccess,
            semanticAttempt,
            diagnostic: attempt.diagnostic
          });
          return;
        }
        lastRepair = attempt.reason === "length"
          ? { reason: "length", repairContext: attempt.repairContext, repairMode: "fresh" }
          : { reason: attempt.reason };
        if (semanticAttempt < CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT) continue;
        terminalOutcomeRecorded = true;
        await persistTerminal(
          () => failCustomScriptJob(job.id, leaseToken, "CUSTOM_SCRIPT_OUTPUT_INVALID"),
          "custom_script_failed",
          "CUSTOM_SCRIPT_OUTPUT_INVALID",
          semanticAttempt,
          attempt.diagnostic
        );
        return;
      }
      if (attempt.result.status === "needs_profile") {
        if (firstSafeSuccess) {
          await completeSuccess({
            ...firstSafeSuccess,
            semanticAttempt,
            diagnostic: attempt.diagnostic
          });
          return;
        }
        const missingFacts = attempt.result.missingFacts;
        terminalOutcomeRecorded = true;
        await persistTerminal(
          () => completeCustomScriptNeedsProfile({
            jobId: job.id,
            leaseToken,
            missingFacts
          }),
          "custom_script_needs_profile",
          undefined,
          semanticAttempt,
          attempt.diagnostic
        );
        return;
      }
      const candidate = {
        finalScript: attempt.result.finalScript,
        characterCount: countCustomScriptCodePoints(attempt.result.finalScript),
        semanticAttempt,
        diagnostic: attempt.diagnostic
      };
      if (firstSafeSuccess) {
        await completeSuccess(
          shouldUseCustomScriptQualityCandidate(firstSafeSuccess.characterCount, candidate.characterCount)
            ? candidate
            : {
                ...firstSafeSuccess,
                semanticAttempt,
                diagnostic: attempt.diagnostic
              }
        );
        return;
      }
      if (
        semanticAttempt < CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT
        && shouldAttemptCustomScriptQualityEnrichment(candidate.characterCount)
      ) {
        const fallback = createCustomScriptQualityFallback(candidate.finalScript, validated.inputType);
        const persisted = await persistCustomScriptQualityFallback({
          jobId: job.id,
          leaseToken,
          fallback
        }).catch(() => false);
        if (!persisted) {
          await completeSuccess(candidate);
          return;
        }
        firstSafeSuccess = candidate;
        lastRepair = { reason: "quality_enrichment", repairMode: "fresh" };
        continue;
      }
      await completeSuccess(candidate);
      return;
    }
    if (!(await lease.canContinue())) return;
    terminalOutcomeRecorded = true;
    await persistTerminal(
      () => failCustomScriptJob(job.id, leaseToken, "CUSTOM_SCRIPT_OUTPUT_INVALID"),
      "custom_script_failed",
      "CUSTOM_SCRIPT_OUTPUT_INVALID",
      CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT,
      lastDiagnostic
    );
  });
  if (heartbeatOutcome.status === "lease_lost" && !terminalOutcomeRecorded) {
    logCustomScriptOutcome(
      "custom_script_completion_lost",
      job.id,
      startedAt,
      "CUSTOM_SCRIPT_COMPLETION_LOST",
      lastSemanticAttempt,
      lastDiagnostic,
      writeLine
    );
  }
}

async function reserveProviderCall(
  jobId: string,
  leaseToken: string,
  semanticAttempt: number,
  minimumRemainingMs = 0
) {
  return (await prisma.customScriptGenerationJob.updateMany({
    where: {
      id: jobId,
      status: "processing",
      lockedBy: leaseToken,
      runDeadlineAt: { gt: new Date(Date.now() + minimumRemainingMs) },
      providerCallsStarted: { lt: CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT }
    },
    data: {
      providerCallsStarted: { increment: 1 },
      semanticAttempt
    }
  })).count === 1;
}

function parseStoredInput(value: Prisma.JsonValue | null): ValidatedCustomScriptInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    return validateCustomScriptRequestBody(value as Record<string, unknown>);
  } catch {
    return null;
  }
}
