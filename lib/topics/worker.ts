import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAttemptTopicJob, getTopicJobLockTimeoutMs } from "@/lib/topics/job-policy";
import { cleanupExpiredTopicJobs, processClaimedTopicJob, reconcileTopicJobDeadlines } from "@/lib/topics/jobs";

export async function recoverStaleTopicJobs(now = new Date()) {
  const staleBefore = new Date(now.getTime() - getTopicJobLockTimeoutMs());
  const jobs = await prisma.topicGenerationJob.findMany({
    where: { status: "processing", OR: [{ lockedAt: { lte: staleBefore } }, { runDeadlineAt: { lte: now } }] },
    select: { id: true, attemptCount: true, maxAttempts: true, runDeadlineAt: true }
  });
  const retryIds = jobs.filter((job) => job.runDeadlineAt > now && canAttemptTopicJob(job)).map((job) => job.id);
  const failedIds = jobs.filter((job) => job.runDeadlineAt <= now || !canAttemptTopicJob(job)).map((job) => job.id);
  if (retryIds.length) await prisma.topicGenerationJob.updateMany({
    where: { id: { in: retryIds }, status: "processing" },
    data: { status: "queued", availableAt: now, errorCode: "TOPIC_WORKER_INTERRUPTED", lockedAt: null, lockedBy: null }
  });
  if (failedIds.length) await prisma.topicGenerationJob.updateMany({
    where: { id: { in: failedIds }, status: "processing" },
    data: { status: "failed", errorCode: "TOPIC_WORKER_EXHAUSTED", input: Prisma.DbNull, result: Prisma.DbNull, lockedAt: null, lockedBy: null }
  });
}

export async function claimNextTopicJob(workerId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const now = new Date();
    const candidates = await prisma.topicGenerationJob.findMany({
      where: { status: "queued", availableAt: { lte: now }, runDeadlineAt: { gt: now } },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      take: 20,
      select: { id: true, attemptCount: true, maxAttempts: true }
    });
    const exhausted = candidates.filter((job) => !canAttemptTopicJob(job));
    if (exhausted.length) await prisma.topicGenerationJob.updateMany({
      where: { id: { in: exhausted.map((job) => job.id) }, status: "queued" },
      data: { status: "failed", errorCode: "TOPIC_WORKER_EXHAUSTED", input: Prisma.DbNull, result: Prisma.DbNull }
    });
    const candidate = candidates.find(canAttemptTopicJob);
    if (!candidate) return null;
    const claimed = await prisma.topicGenerationJob.updateMany({
      where: { id: candidate.id, status: "queued", attemptCount: candidate.attemptCount, availableAt: { lte: now } },
      data: { status: "processing", attemptCount: { increment: 1 }, lockedAt: now, lockedBy: workerId, errorCode: null }
    });
    if (claimed.count === 1) return candidate.id;
  }
  return null;
}

export async function runTopicWorker(options?: { signal?: AbortSignal; workerId?: string }) {
  const workerId = options?.workerId || `topic-worker-${randomUUID()}`;
  let nextRecovery = 0;
  while (!options?.signal?.aborted) {
    if (Date.now() >= nextRecovery) {
      await recoverStaleTopicJobs().catch(() => undefined);
      await reconcileTopicJobDeadlines().catch(() => undefined);
      await cleanupExpiredTopicJobs().catch(() => undefined);
      nextRecovery = Date.now() + 30_000;
    }
    const jobId = await claimNextTopicJob(workerId);
    if (jobId) await processClaimedTopicJob(jobId, workerId).catch(() => undefined);
    else await sleep(2_000, options?.signal);
  }
}

/** Loads the complete Topic Worker dependency graph and verifies database access without consuming a queued job. */
export async function verifyTopicWorkerRuntime() {
  await prisma.$queryRaw`SELECT 1`;
  await reconcileTopicJobDeadlines();
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", done); clearTimeout(timeout); resolve(); }
    signal?.addEventListener("abort", done, { once: true });
  });
}
