import { requestDeepSeekJson } from "@/lib/ai/deepseek-runtime";
import {
  type CustomScriptRepair
} from "@/lib/custom-scripts/contracts";
import {
  CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT,
  CUSTOM_SCRIPT_JOB_RUN_TIMEOUT_MS
} from "@/lib/custom-scripts/job-policy";
import {
  requestCustomScriptAttempt,
  type CustomScriptAttemptResult,
  type CustomScriptProvider
} from "@/lib/custom-scripts/service-runtime";
import { countCustomScriptCodePoints } from "@/lib/custom-scripts/text";

const probeSwitch = "STAGING";
const requiredModel = "deepseek-v4-flash";
const runLimit = 5;
const probeUserId = "staging-link-first-probe";
const probeRequestText = "写一条面向附近上班族的下午茶口播，突出当天现做，语气像朋友推荐。";

type ProbeStatus = "passed" | "needs_profile" | "invalid" | "provider_failed";
type ProbeLengthBucket = "under_80" | "80_199" | "200_239" | "240_299" | "300_350" | "over_350" | "not_returned";
type ProbeMetric = {
  runIndex: number;
  status: ProbeStatus;
  providerCalls: number;
  durationMs: number;
  lengthBucket: ProbeLengthBucket;
  parserReason: string;
  scriptLengthBucket: string;
  finishReason: string;
  providerSubreason: string;
};

type AttemptInput = Parameters<typeof requestCustomScriptAttempt>[0];
export type StagingLinkFirstProbeAttempt = (input: AttemptInput) => Promise<CustomScriptAttemptResult>;

export class LinkFirstProbeValidationError extends Error {
  constructor(public readonly reason: "gate_disabled" | "staging_provider_disabled" | "model_mismatch" | "profile_not_found") {
    super(reason);
  }
}

/**
 * Uses the product service boundary while removing usage attribution so a staging
 * reliability probe cannot change account-level counters.
 */
export async function requestStagingLinkFirstProbeAttempt(
  input: AttemptInput,
  provider: CustomScriptProvider = requestDeepSeekJson
) {
  return requestCustomScriptAttempt(input, (request) => {
    const requestWithoutUsage = { ...request };
    delete requestWithoutUsage.usageUserId;
    return provider(requestWithoutUsage);
  });
}

/** Runs at most five serial, quota-free probes and stops after the first failed run. */
export async function runStagingLinkFirstProbeSeries(input: {
  env: Record<string, string | undefined>;
  runtimeModel: string;
  merchantProjectName: string;
  loadProfile: () => Promise<string | null | undefined>;
  attempt?: StagingLinkFirstProbeAttempt;
  writeLine?: (line: string) => void;
  now?: () => number;
}) {
  assertProbeGate(input.env, input.runtimeModel);
  const profileText = await input.loadProfile();
  if (!profileText?.trim()) throw new LinkFirstProbeValidationError("profile_not_found");

  const attempt = input.attempt ?? requestStagingLinkFirstProbeAttempt;
  const writeLine = input.writeLine ?? ((line: string) => process.stdout.write(line));
  const now = input.now ?? Date.now;
  let runsCompleted = 0;

  for (let runIndex = 1; runIndex <= runLimit; runIndex += 1) {
    const startedAt = now();
    const runDeadlineAt = startedAt + CUSTOM_SCRIPT_JOB_RUN_TIMEOUT_MS;
    let providerCalls = 0;
    let repair: CustomScriptRepair | undefined;
    let result: CustomScriptAttemptResult | undefined;

    while (providerCalls < CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT) {
      const timeoutMs = runDeadlineAt - now();
      if (timeoutMs <= 0) {
        result = {
          status: "provider_failed",
          errorCode: "CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE",
          diagnostic: { providerSubreason: "timeout" }
        };
        break;
      }
      providerCalls += 1;
      try {
        result = await attempt({
          userId: probeUserId,
          merchantProjectName: input.merchantProjectName,
          merchantProfileText: profileText,
          requestText: probeRequestText,
          objective: "trust",
          tone: "natural",
          ...(repair ? { repair } : {}),
          timeoutMs
        });
      } catch {
        result = {
          status: "provider_failed",
          errorCode: "CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE",
          diagnostic: { providerSubreason: "unknown" }
        };
      }
      if (result.status !== "invalid" || providerCalls >= CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT) break;
      repair = retryRepair(result);
    }

    const metric = buildMetric(runIndex, providerCalls, Math.max(0, now() - startedAt), result);
    runsCompleted = runIndex;
    writeLine(`${JSON.stringify(metric)}\n`);
    if (metric.status !== "passed") {
      writeLine(`${JSON.stringify({ gate: false, runsCompleted })}\n`);
      return { gate: false, runsCompleted };
    }
  }

  writeLine(`${JSON.stringify({ gate: true, runsCompleted })}\n`);
  return { gate: true, runsCompleted };
}

function assertProbeGate(env: Record<string, string | undefined>, runtimeModel: string) {
  if (env.CUSTOM_SCRIPT_LINK_FIRST_PROBE !== probeSwitch) {
    throw new LinkFirstProbeValidationError("gate_disabled");
  }
  if (env.STAGING_ENABLE_REAL_PROVIDERS !== "1") {
    throw new LinkFirstProbeValidationError("staging_provider_disabled");
  }
  if (runtimeModel !== requiredModel) {
    throw new LinkFirstProbeValidationError("model_mismatch");
  }
}

function retryRepair(result: Extract<CustomScriptAttemptResult, { status: "invalid" }>): CustomScriptRepair {
  return result.reason === "length"
    ? {
        reason: "length",
        repairMode: "fresh",
        repairContext: result.repairContext
      }
    : { reason: result.reason };
}

function buildMetric(
  runIndex: number,
  providerCalls: number,
  durationMs: number,
  result: CustomScriptAttemptResult | undefined
): ProbeMetric {
  const diagnostic = result?.diagnostic ?? {};
  const status = probeStatus(result);
  return {
    runIndex,
    status,
    providerCalls,
    durationMs,
    lengthBucket: result?.status === "success" && result.result.status === "success"
      ? lengthBucket(countCustomScriptCodePoints(result.result.finalScript))
      : "not_returned",
    parserReason: diagnostic.parserReason ?? "none",
    scriptLengthBucket: diagnostic.scriptLengthBucket ?? (status === "passed" ? "accepted" : "not_returned"),
    finishReason: diagnostic.finishReason ?? "unknown",
    providerSubreason: diagnostic.providerSubreason ?? "none"
  };
}

function probeStatus(result: CustomScriptAttemptResult | undefined): ProbeStatus {
  if (!result || result.status === "provider_failed") return "provider_failed";
  if (result.status === "invalid") return "invalid";
  return result.result.status === "success" ? "passed" : "needs_profile";
}

function lengthBucket(count: number): ProbeLengthBucket {
  if (count < 80) return "under_80";
  if (count < 200) return "80_199";
  if (count < 240) return "200_239";
  if (count < 300) return "240_299";
  if (count <= 350) return "300_350";
  return "over_350";
}
