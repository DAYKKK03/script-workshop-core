import { randomUUID } from "node:crypto";
import {
  CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT,
  customScriptLeaseStaleBefore
} from "@/lib/custom-scripts/job-policy";
import { processClaimedCustomScriptJob } from "@/lib/custom-scripts/job-runner";
import {
  cleanupExpiredCustomScriptJobs,
  failStaleExhaustedCustomScriptJobs,
  reconcileCustomScriptDeadlines
} from "@/lib/custom-scripts/jobs";
import { parseCustomScriptQualityFallback } from "@/lib/custom-scripts/quality-fallback";
import { prisma } from "@/lib/prisma";

export async function claimNextCustomScriptJob(workerId: string, now = new Date()) {
  const staleBefore = customScriptLeaseStaleBefore(now);
  const candidates = await prisma.customScriptGenerationJob.findMany({
    where: {
      runDeadlineAt: { gt: now },
      OR: [
        { status: "queued", availableAt: { lte: now } },
        { status: "processing", lockedAt: { lte: staleBefore } }
      ]
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: 20,
    select: { id: true, status: true, lockedBy: true, lockedAt: true, providerCallsStarted: true, result: true }
  });
  const exhausted = candidates.filter((job) => {
    const hasRecoverableFallback = job.providerCallsStarted === CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT
      && Boolean(parseCustomScriptQualityFallback(job.result));
    return job.status === "processing"
      && job.providerCallsStarted >= CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT
      && !hasRecoverableFallback;
  });
  await failStaleExhaustedCustomScriptJobs(exhausted.map((job) => job.id), staleBefore, now);
  for (const candidate of candidates) {
    const hasQualityFallback = candidate.providerCallsStarted >= 1
      && candidate.providerCallsStarted <= CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT
      && Boolean(parseCustomScriptQualityFallback(candidate.result));
    if (candidate.providerCallsStarted >= CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT && !hasQualityFallback) continue;
    const leaseToken = `${workerId}:${randomUUID()}`;
    const claimed = await prisma.customScriptGenerationJob.updateMany({
      where: {
        id: candidate.id,
        runDeadlineAt: { gt: now },
        providerCallsStarted: hasQualityFallback
          ? { lte: CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT }
          : { lt: CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT },
        OR: [
          { status: "queued", availableAt: { lte: now } },
          {
            status: "processing",
            lockedBy: candidate.lockedBy,
            lockedAt: candidate.lockedAt ? { equals: candidate.lockedAt, lte: staleBefore } : null
          }
        ]
      },
      data: { status: "processing", lockedAt: now, lockedBy: leaseToken, errorCode: null }
    });
    if (claimed.count === 1) return { id: candidate.id, leaseToken };
  }
  return null;
}

export async function runCustomScriptWorker(options?: { signal?: AbortSignal; workerId?: string }) {
  const workerId = options?.workerId || `custom-script-worker-${randomUUID()}`;
  let nextMaintenanceAt = 0;
  while (!options?.signal?.aborted) {
    if (Date.now() >= nextMaintenanceAt) {
      await reconcileCustomScriptDeadlines().catch(() => undefined);
      await cleanupExpiredCustomScriptJobs().catch(() => undefined);
      nextMaintenanceAt = Date.now() + 10_000;
    }
    const claim = await claimNextCustomScriptJob(workerId);
    if (claim) await processClaimedCustomScriptJob(claim.id, claim.leaseToken).catch(() => undefined);
    else await sleep(1_500, options?.signal);
  }
}

/** Loads the standalone dependency graph and checks DB access without claiming work. */
export async function verifyCustomScriptWorkerRuntime() {
  await prisma.$queryRaw`SELECT 1`;
  await reconcileCustomScriptDeadlines();
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", done);
      clearTimeout(timeout);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}
