import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { assertIsolatedTestDatabaseUrl } from "../helpers/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (testDatabaseUrl) assertIsolatedTestDatabaseUrl(testDatabaseUrl, process.env.DATABASE_URL);

let prisma: PrismaClient;
let userId = "";

function postgresTest(name: string, fn: () => Promise<void>) {
  return test(name, { skip: testDatabaseUrl ? false : "TEST_DATABASE_URL is required" }, fn);
}

test.before(async () => {
  if (!testDatabaseUrl) return;
  process.env.DATABASE_URL = testDatabaseUrl;
  prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  await prisma.$connect();
  userId = (await prisma.user.create({
    data: { account: `topic_recovery_${randomUUID().slice(0, 12)}`, passwordHash: "integration-only", inviteCodeUsed: `topic_recovery_${randomUUID().slice(0, 12)}`, dailyTopicLimit: 10 }
  })).id;
});

test.after(async () => {
  if (!testDatabaseUrl) return;
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await prisma.$disconnect();
});

async function createJob(runDeadlineAt = new Date(Date.now() + 120_000)) {
  const project = await prisma.project.create({ data: { userId, projectName: `topic-retry-${randomUUID().slice(0, 8)}`, profileText: "integration only" } });
  return await prisma.topicGenerationJob.create({
    data: {
      userId,
      projectId: project.id,
      clientRequestId: randomUUID(),
      input: { integration: true },
      runDeadlineAt,
      expiresAt: new Date(Date.now() + 30 * 60_000)
    }
  });
}

postgresTest("a recoverable first failure requeues the same job and only a second claim can complete it", async () => {
  const { claimNextTopicJob } = await import("../../lib/topics/worker");
  const { completeTopicJobAndChargeQuota, handleTopicJobFailure } = await import("../../lib/topics/jobs");
  const job = await createJob();
  const first = await claimNextTopicJob("topic-retry-first");
  assert.equal(first, job.id);
  assert.equal(await handleTopicJobFailure({ jobId: job.id, workerId: "topic-retry-first", errorCode: "AI_PROVIDER_INVALID_JSON" }), "requeued");
  const requeued = await prisma.topicGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(requeued.status, "queued");
  assert.equal(requeued.attemptCount, 1);
  assert.equal(requeued.clientRequestId, job.clientRequestId);
  assert.deepEqual(requeued.input, { integration: true });
  const second = await claimNextTopicJob("topic-retry-second");
  assert.equal(second, job.id);
  await Promise.all([
    completeTopicJobAndChargeQuota(job.id, userId, "topic-retry-second", { ideas: [], topPicks: [] }),
    completeTopicJobAndChargeQuota(job.id, userId, "topic-retry-second", { ideas: [], topPicks: [] })
  ]);
  const completed = await prisma.topicGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.attemptCount, 2);
  assert.equal((await prisma.dailyUsage.findUnique({ where: { userId_usageDate: { userId, usageDate: new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })) } } }))?.topicIdeasGenerated, 1);
});

postgresTest("a changed max-attempt limit fences the conditional requeue after the job is read", async () => {
  const { claimNextTopicJob } = await import("../../lib/topics/worker");
  const { handleTopicJobFailure } = await import("../../lib/topics/jobs");
  const job = await createJob();
  assert.equal(await claimNextTopicJob("topic-max-fence"), job.id);
  assert.equal(await handleTopicJobFailure({
    jobId: job.id,
    workerId: "topic-max-fence",
    errorCode: "AI_PROVIDER_INVALID_JSON",
    afterRead: async () => {
      await prisma.topicGenerationJob.update({ where: { id: job.id }, data: { maxAttempts: 1 } });
    }
  }), "failed");
  const terminal = await prisma.topicGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(terminal.status, "failed");
  assert.equal(terminal.maxAttempts, 1);
  assert.notEqual(terminal.status, "queued");
});

postgresTest("second, expired-budget, and nonrecoverable failures are terminal without quota", async () => {
  const { claimNextTopicJob } = await import("../../lib/topics/worker");
  const { handleTopicJobFailure } = await import("../../lib/topics/jobs");
  const job = await createJob();
  assert.equal(await claimNextTopicJob("topic-fail-first"), job.id);
  assert.equal(await handleTopicJobFailure({ jobId: job.id, workerId: "topic-fail-first", errorCode: "AI_PROVIDER_NETWORK_ERROR" }), "requeued");
  assert.equal(await claimNextTopicJob("topic-fail-second"), job.id);
  assert.equal(await handleTopicJobFailure({ jobId: job.id, workerId: "topic-fail-second", errorCode: "AI_PROVIDER_NETWORK_ERROR" }), "failed");
  assert.equal((await prisma.topicGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).status, "failed");

  const widenedJob = await createJob();
  await prisma.topicGenerationJob.update({ where: { id: widenedJob.id }, data: { maxAttempts: 3 } });
  assert.equal(await claimNextTopicJob("topic-widened-first"), widenedJob.id);
  assert.equal(await handleTopicJobFailure({ jobId: widenedJob.id, workerId: "topic-widened-first", errorCode: "AI_PROVIDER_NETWORK_ERROR" }), "requeued");
  assert.equal(await claimNextTopicJob("topic-widened-second"), widenedJob.id);
  assert.equal(await handleTopicJobFailure({ jobId: widenedJob.id, workerId: "topic-widened-second", errorCode: "AI_PROVIDER_NETWORK_ERROR" }), "failed");
  assert.equal((await prisma.topicGenerationJob.findUniqueOrThrow({ where: { id: widenedJob.id } })).status, "failed");

  const deadlineJob = await createJob(new Date(Date.now() + 30_000));
  assert.equal(await claimNextTopicJob("topic-deadline"), deadlineJob.id);
  assert.equal(await handleTopicJobFailure({ jobId: deadlineJob.id, workerId: "topic-deadline", errorCode: "AI_PROVIDER_TIMEOUT" }), "failed");
  assert.equal((await prisma.topicGenerationJob.findUniqueOrThrow({ where: { id: deadlineJob.id } })).errorCode, "TOPIC_JOB_TIMED_OUT");

  const unsafeJob = await createJob();
  assert.equal(await claimNextTopicJob("topic-unsafe"), unsafeJob.id);
  assert.equal(await handleTopicJobFailure({ jobId: unsafeJob.id, workerId: "topic-unsafe", errorCode: "AI_PROVIDER_UNSAFE_RESPONSE" }), "failed");
  assert.equal((await prisma.topicGenerationJob.findUniqueOrThrow({ where: { id: unsafeJob.id } })).errorCode, "AI_PROVIDER_UNSAFE_RESPONSE");
});

postgresTest("worker crash recovery remains distinct from Provider retry", async () => {
  const { claimNextTopicJob, recoverStaleTopicJobs } = await import("../../lib/topics/worker");
  const job = await createJob();
  assert.equal(await claimNextTopicJob("topic-crashed"), job.id);
  const now = new Date();
  await prisma.topicGenerationJob.update({ where: { id: job.id }, data: { lockedAt: new Date(now.getTime() - 7 * 60_000) } });
  await recoverStaleTopicJobs(now);
  const recovered = await prisma.topicGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(recovered.status, "queued");
  assert.equal(recovered.errorCode, "TOPIC_WORKER_INTERRUPTED");
  assert.equal(recovered.attemptCount, 1);
});
