import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { PrismaClient, type ExtractionJobStatus } from "@prisma/client";
import {
  acquireWorkerTestLock,
  releaseWorkerTestLock
} from "./worker-test-lock";
import { assertIsolatedTestDatabaseUrl } from "../helpers/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const testPrefix = "p119_worker_test_";

if (testDatabaseUrl) {
  assertIsolatedTestDatabaseUrl(testDatabaseUrl, process.env.DATABASE_URL);
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DOUYIN_PROVIDER = "blocked";
  process.env.EXTRACTION_WORKER_LOCK_TIMEOUT_MS = "100";
}

let prisma: PrismaClient;
let recoverStaleExtractionJobs: typeof import("../../lib/douyin/extraction-worker.ts").recoverStaleExtractionJobs;
let claimNextExtractionJob: typeof import("../../lib/douyin/extraction-worker.ts").claimNextExtractionJob;

function postgresTest(name: string, fn: () => Promise<void>) {
  return test(
    name,
    { skip: testDatabaseUrl ? false : "TEST_DATABASE_URL is required" },
    fn
  );
}

test.before(async () => {
  if (!testDatabaseUrl) return;
  prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  await prisma.$connect();
  await acquireWorkerTestLock(testDatabaseUrl);
  ({ recoverStaleExtractionJobs, claimNextExtractionJob } = await import(
    "../../lib/douyin/extraction-worker.ts"
  ));
  await cleanupTestRecords();
});

test.beforeEach(async () => {
  if (!testDatabaseUrl) return;
  await cleanupTestRecords();
});

test.after(async () => {
  if (!testDatabaseUrl) return;
  await cleanupTestRecords();
  await releaseWorkerTestLock();
  await prisma.$disconnect();
});

test.afterEach(async () => {
  if (!testDatabaseUrl) return;
  await cleanupTestRecords();
});

postgresTest("Worker B recovers and reclaims Worker A's expired lock", async () => {
  const now = new Date();
  const job = await createJob({
    status: "processing",
    lockedBy: "worker-a",
    lockedAt: new Date(now.getTime() - 1_000),
    attemptCount: 1
  });

  await recoverStaleExtractionJobs(now);
  const recovered = await prisma.extractionJob.findUniqueOrThrow({
    where: { id: job.id }
  });
  assert.equal(recovered.status, "queued");
  assert.equal(recovered.lockedAt, null);
  assert.equal(recovered.lockedBy, null);

  assert.equal(await claimNextExtractionJob("worker-b"), job.id);
  const reclaimed = await prisma.extractionJob.findUniqueOrThrow({
    where: { id: job.id }
  });
  assert.equal(reclaimed.status, "processing");
  assert.equal(reclaimed.lockedBy, "worker-b");
  assert.equal(reclaimed.attemptCount, 2);
});

postgresTest("Worker B does not recover an unexpired Worker A lock", async () => {
  const now = new Date();
  const job = await createJob({
    status: "processing",
    lockedBy: "worker-a",
    lockedAt: now,
    attemptCount: 1
  });

  await recoverStaleExtractionJobs(now);
  const unchanged = await prisma.extractionJob.findUniqueOrThrow({
    where: { id: job.id }
  });
  assert.equal(unchanged.status, "processing");
  assert.equal(unchanged.lockedBy, "worker-a");
  assert.equal(await claimNextExtractionJob("worker-b"), null);
});

postgresTest("exhausted stale jobs fail and clear sensitive runtime fields", async () => {
  const now = new Date();
  const job = await createJob({
    status: "processing",
    lockedBy: "worker-a",
    lockedAt: new Date(now.getTime() - 1_000),
    attemptCount: 3,
    maxAttempts: 3,
    transcript: "test-only-transcript"
  });

  await recoverStaleExtractionJobs(now);
  const failed = await prisma.extractionJob.findUniqueOrThrow({
    where: { id: job.id }
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "EXTRACTION_WORKER_EXHAUSTED");
  assert.equal(failed.sourceUrl, null);
  assert.equal(failed.transcript, null);
  assert.equal(failed.lockedAt, null);
  assert.equal(failed.lockedBy, null);
});

postgresTest("expired jobs fail and clear sensitive runtime fields", async () => {
  const now = new Date();
  const job = await createJob({
    status: "processing",
    lockedBy: "worker-a",
    lockedAt: now,
    attemptCount: 1,
    expiresAt: new Date(now.getTime() - 1_000),
    transcript: "test-only-transcript"
  });

  await recoverStaleExtractionJobs(now);
  const failed = await prisma.extractionJob.findUniqueOrThrow({
    where: { id: job.id }
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.sourceUrl, null);
  assert.equal(failed.transcript, null);
  assert.equal(failed.lockedAt, null);
  assert.equal(failed.lockedBy, null);
});

postgresTest("two Workers concurrently claim a queued job only once", async () => {
  const job = await createJob();

  const claims = await Promise.all([
    claimNextExtractionJob("worker-a"),
    claimNextExtractionJob("worker-b")
  ]);
  assert.equal(claims.filter((id) => id === job.id).length, 1);
  assert.equal(claims.filter((id) => id === null).length, 1);

  const claimed = await prisma.extractionJob.findUniqueOrThrow({
    where: { id: job.id }
  });
  assert.equal(claimed.status, "processing");
  assert.equal(claimed.attemptCount, 1);
  assert.ok(["worker-a", "worker-b"].includes(claimed.lockedBy || ""));
});

postgresTest("future availableAt jobs stay queued until they are due", async () => {
  const job = await createJob({
    availableAt: new Date(Date.now() + 60_000)
  });

  assert.equal(await claimNextExtractionJob("worker-a"), null);

  const unchanged = await prisma.extractionJob.findUniqueOrThrow({
    where: { id: job.id }
  });
  assert.equal(unchanged.status, "queued");
  assert.equal(unchanged.attemptCount, 0);
});

postgresTest("queued exhausted jobs fail before claim and clear runtime fields", async () => {
  const job = await createJob({
    attemptCount: 3,
    maxAttempts: 3,
    transcript: "test-only-transcript"
  });

  assert.equal(await claimNextExtractionJob("worker-a"), null);

  const failed = await prisma.extractionJob.findUniqueOrThrow({
    where: { id: job.id }
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "EXTRACTION_WORKER_EXHAUSTED");
  assert.equal(failed.sourceUrl, null);
  assert.equal(failed.transcript, null);
  assert.equal(failed.lockedAt, null);
  assert.equal(failed.lockedBy, null);
});

postgresTest("a new Worker process resolves a stale job claimed by Worker A", async () => {
  const job = await createJob();
  assert.equal(await claimNextExtractionJob("worker-a"), job.id);
  await prisma.extractionJob.update({
    where: { id: job.id },
    data: { lockedAt: new Date(Date.now() - 1_000) }
  });

  const worker = startWorkerProcess("worker-b");
  try {
    const terminal = await waitForJob(job.id, (status) => status === "failed");
    assert.equal(terminal.status, "failed");
    assert.equal(terminal.sourceUrl, null);
    assert.equal(terminal.transcript, null);
    assert.equal(terminal.lockedAt, null);
    assert.equal(terminal.lockedBy, null);
  } finally {
    await stopWorkerProcess(worker);
  }
});

postgresTest("a running Worker periodically recovers a newly orphaned job", async () => {
  const worker = startWorkerProcess("periodic-worker");
  try {
    await delay(250);
    const job = await createJob({
      status: "processing",
      lockedBy: "stopped-worker",
      lockedAt: new Date(Date.now() - 1_000),
      attemptCount: 1
    });

    const terminal = await waitForJob(job.id, (status) => status === "failed");
    assert.equal(terminal.status, "failed");
    assert.equal(terminal.sourceUrl, null);
    assert.equal(terminal.lockedAt, null);
    assert.equal(terminal.lockedBy, null);
  } finally {
    await stopWorkerProcess(worker);
  }
});

type JobOverrides = {
  status?: ExtractionJobStatus;
  lockedAt?: Date | null;
  lockedBy?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  availableAt?: Date;
  expiresAt?: Date | null;
  transcript?: string | null;
};

async function createJob(overrides: JobOverrides = {}) {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      account: `${testPrefix}${id}`,
      passwordHash: "test-only-password-hash",
      inviteCodeUsed: `${testPrefix}${id}`
    }
  });

  return prisma.extractionJob.create({
    data: {
      userId: user.id,
      sourceUrl: "https://example.invalid/test-only-source",
      sourceHost: "example.invalid",
      sourceHash: id.replaceAll("-", ""),
      status: overrides.status || "queued",
      lockedAt: overrides.lockedAt,
      lockedBy: overrides.lockedBy,
      attemptCount: overrides.attemptCount || 0,
      maxAttempts: overrides.maxAttempts || 3,
      availableAt:
        overrides.availableAt === undefined
          ? new Date(Date.now() - 1_000)
          : overrides.availableAt,
      expiresAt:
        overrides.expiresAt === undefined
          ? new Date(Date.now() + 60_000)
          : overrides.expiresAt,
      transcript: overrides.transcript
    }
  });
}

function startWorkerProcess(workerId: string) {
  const executable = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  return spawn(
    executable,
    ["--tsconfig", "tsconfig.json", "worker/extraction-worker.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        DOUYIN_PROVIDER: "blocked",
        EXTRACTION_WORKER_ID: workerId,
        EXTRACTION_WORKER_CONCURRENCY: "1",
        EXTRACTION_WORKER_POLL_INTERVAL_MS: "50",
        EXTRACTION_WORKER_RECOVERY_INTERVAL_MS: "100",
        EXTRACTION_WORKER_LOCK_TIMEOUT_MS: "100"
      },
      stdio: "ignore"
    }
  );
}

async function stopWorkerProcess(worker: ChildProcess) {
  if (worker.exitCode !== null) return;
  worker.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => worker.once("exit", () => resolve())),
    delay(2_000).then(async () => {
      if (worker.exitCode !== null) return;
      worker.kill("SIGKILL");
      await new Promise<void>((resolve) => worker.once("exit", () => resolve()));
    })
  ]);
}

async function waitForJob(
  jobId: string,
  predicate: (status: ExtractionJobStatus) => boolean
) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const job = await prisma.extractionJob.findUniqueOrThrow({
      where: { id: jobId }
    });
    if (predicate(job.status)) return job;
    await delay(50);
  }
  throw new Error("Worker integration condition timed out");
}

async function cleanupTestRecords() {
  await prisma.extractionJob.deleteMany({
    where: {
      user: { account: { startsWith: testPrefix } }
    }
  });
  await prisma.user.deleteMany({
    where: { account: { startsWith: testPrefix } }
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
