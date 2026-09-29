import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { assertIsolatedTestDatabaseUrl } from "../helpers/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const testPrefix = "P119_SEED_TEST_";

if (testDatabaseUrl) assertIsolatedTestDatabaseUrl(testDatabaseUrl, process.env.DATABASE_URL);

let prisma: PrismaClient;

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
  await cleanupSeedRecords();
});

test.after(async () => {
  if (!testDatabaseUrl) return;
  await cleanupSeedRecords();
  await prisma.$disconnect();
});

test("seed connection failures return only a safe summary", () => {
  const result = runSeed(
    "postgresql://test-user:test-password@127.0.0.1:1/test_database?schema=public",
    `${testPrefix}CONNECTION_FAILURE`
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /Database seed failed/);
  assert.doesNotMatch(output, /test-password|127\.0\.0\.1|test_database|P1001|P1002/);
});

postgresTest("seed writes invite codes only to the explicit test database", async () => {
  const code = `${testPrefix}${randomUUID().replaceAll("-", "")}`;
  const result = runSeed(testDatabaseUrl!, code);

  assert.equal(result.status, 0);
  assert.equal(
    await prisma.inviteCode.count({ where: { code } }),
    1
  );
});

postgresTest("seed upsert is idempotent", async () => {
  const code = `${testPrefix}${randomUUID().replaceAll("-", "")}`;

  assert.equal(runSeed(testDatabaseUrl!, code).status, 0);
  assert.equal(runSeed(testDatabaseUrl!, code).status, 0);
  assert.equal(await prisma.inviteCode.count({ where: { code } }), 1);
});

postgresTest("seed trims and creates multiple comma-separated invite codes", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const codes = [
    `${testPrefix}A_${suffix}`,
    `${testPrefix}B_${suffix}`,
    `${testPrefix}C_${suffix}`
  ];

  const result = runSeed(
    testDatabaseUrl!,
    `  ${codes[0]} , ${codes[1]},  ${codes[2]}  `
  );
  assert.equal(result.status, 0);
  assert.equal(
    await prisma.inviteCode.count({ where: { code: { in: codes } } }),
    3
  );
});

postgresTest("seed accepts an empty invite-code list without writing records", async () => {
  const before = await prisma.inviteCode.count({
    where: { code: { startsWith: testPrefix } }
  });
  const result = runSeed(testDatabaseUrl!, "");
  const after = await prisma.inviteCode.count({
    where: { code: { startsWith: testPrefix } }
  });

  assert.equal(result.status, 0);
  assert.equal(after, before);
});

function runSeed(databaseUrl: string, inviteCodes: string) {
  return spawnSync(process.execPath, ["prisma/seed.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SEED_INVITE_CODES: inviteCodes
    }
  });
}

async function cleanupSeedRecords() {
  await prisma.inviteCode.deleteMany({
    where: { code: { startsWith: testPrefix } }
  });
}
