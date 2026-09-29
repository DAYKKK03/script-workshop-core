import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  acquireWorkerTestLock,
  releaseWorkerTestLock
} from "./worker-test-lock";
import { assertIsolatedTestDatabaseUrl } from "../helpers/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const probeAccountPrefix = "worker_functional_probe_";

if (testDatabaseUrl) assertIsolatedTestDatabaseUrl(testDatabaseUrl, process.env.DATABASE_URL);

let prisma: PrismaClient;

test.before(async () => {
  if (!testDatabaseUrl) return;
  prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  await prisma.$connect();
  await acquireWorkerTestLock(testDatabaseUrl);
  await cleanupProbeRecords();
});

test.after(async () => {
  if (!testDatabaseUrl) return;
  await cleanupProbeRecords();
  await releaseWorkerTestLock();
  await prisma.$disconnect();
});

test(
  "functional probe proves the Worker main loop can reach a terminal job state",
  { skip: testDatabaseUrl ? false : "TEST_DATABASE_URL is required" },
  async () => {
    const worker = startWorkerProcess();
    try {
      const probe = spawnSync(
        path.join(process.cwd(), "node_modules", ".bin", "tsx"),
        ["--tsconfig", "tsconfig.json", "worker/verify-functional.ts"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 10_000,
          env: runtimeEnvironment()
        }
      );

      assert.equal(probe.status, 0);
      assert.equal(probe.stdout, "Worker functional verification passed\n");
      assert.equal(probe.stderr, "");
      assert.equal(
        await prisma.user.count({
          where: { account: { startsWith: probeAccountPrefix } }
        }),
        0
      );
    } finally {
      await stopWorkerProcess(worker);
    }
  }
);

function startWorkerProcess() {
  return spawn(
    path.join(process.cwd(), "node_modules", ".bin", "tsx"),
    ["--tsconfig", "tsconfig.json", "worker/extraction-worker.ts"],
    {
      cwd: process.cwd(),
      env: runtimeEnvironment(),
      stdio: "ignore"
    }
  );
}

function runtimeEnvironment() {
  return {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    DOUYIN_PROVIDER: "blocked",
    EXTRACTION_WORKER_CONCURRENCY: "1",
    EXTRACTION_WORKER_POLL_INTERVAL_MS: "50",
    EXTRACTION_WORKER_RECOVERY_INTERVAL_MS: "100"
  };
}

async function stopWorkerProcess(worker: ChildProcess) {
  if (worker.exitCode !== null) return;
  worker.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => worker.once("exit", () => resolve())),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (worker.exitCode !== null) {
          resolve();
          return;
        }
        worker.kill("SIGKILL");
        worker.once("exit", () => resolve());
      }, 2_000);
    })
  ]);
}

async function cleanupProbeRecords() {
  await prisma.user.deleteMany({
    where: { account: { startsWith: probeAccountPrefix } }
  });
}
