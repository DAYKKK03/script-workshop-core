import { CUSTOM_SCRIPT_JOB_HEARTBEAT_MS } from "@/lib/custom-scripts/job-policy";
import { prisma } from "@/lib/prisma";

type CustomScriptLeaseGuard = {
  canContinue: () => Promise<boolean>;
};

type CustomScriptHeartbeatOutcome<T> =
  | { status: "completed"; value: T }
  | { status: "lease_lost" };

type CustomScriptHeartbeatDependencies = {
  intervalMs?: number;
  renewLease?: () => Promise<{ count: number }>;
};

/** Renews one job lease and converts renewal failures into a non-throwing lease-lost outcome. */
export async function withCustomScriptHeartbeat<T>(
  jobId: string,
  leaseToken: string,
  task: (lease: CustomScriptLeaseGuard) => Promise<T>,
  dependencies: CustomScriptHeartbeatDependencies = {}
): Promise<CustomScriptHeartbeatOutcome<T>> {
  let stopped = false;
  let leaseLost = false;
  let pending: Promise<void> | null = null;
  const renewLease = dependencies.renewLease || (() => prisma.customScriptGenerationJob.updateMany({
    where: { id: jobId, status: "processing", lockedBy: leaseToken },
    data: { lockedAt: new Date() }
  }));
  const timer = setInterval(() => {
    if (stopped || pending) return;
    const heartbeat = Promise.resolve()
      .then(renewLease)
      .then(
        (updated) => { if (updated.count !== 1) leaseLost = true; },
        () => { leaseLost = true; }
      )
      .finally(() => { if (pending === heartbeat) pending = null; });
    pending = heartbeat;
  }, dependencies.intervalMs ?? CUSTOM_SCRIPT_JOB_HEARTBEAT_MS);
  timer.unref?.();
  let value: T;
  try {
    value = await task({
      canContinue: async () => {
        const activeHeartbeat = pending;
        if (activeHeartbeat) await activeHeartbeat;
        return !leaseLost;
      }
    });
  } finally {
    stopped = true;
    clearInterval(timer);
    const finalPending = pending as Promise<void> | null;
    await finalPending?.catch(() => undefined);
  }
  return leaseLost ? { status: "lease_lost" } : { status: "completed", value };
}
