import { PrismaClient } from "@prisma/client";

// Keep every test that writes the shared extraction queue mutually exclusive:
// the two worker integration files spawn real worker processes that claim any
// queued job in the database, and the staging admin runtime test seeds
// processing jobs for its concurrency-limit assertions. A PostgreSQL advisory
// lock keeps those files serialized even though the node test runner executes
// test files in parallel processes.
const workerTestLockKey = BigInt("0x7731395");

// pg_advisory_lock is session scoped, so acquire and release must run on the
// same connection. The shared test clients pool multiple connections, which
// would make session-scoped locking unreliable; a dedicated single-connection
// client guarantees both calls share one session.
let lockClient: PrismaClient | null = null;

export async function acquireWorkerTestLock(databaseUrl: string) {
  if (lockClient) {
    throw new Error("worker test lock is already held by this process");
  }
  const client = new PrismaClient({
    datasourceUrl: buildSingleConnectionUrl(databaseUrl)
  });
  await client.$connect();
  try {
    // pg_advisory_lock returns void, which Prisma cannot deserialize as a
    // selected column; selecting FROM the function call keeps the result set
    // deserializable while still blocking until the lock is granted.
    await client.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_lock(${workerTestLockKey})`;
  } catch (error) {
    await client.$disconnect().catch(() => undefined);
    throw error;
  }
  lockClient = client;
}

export async function releaseWorkerTestLock() {
  const client = lockClient;
  if (!client) return;
  lockClient = null;
  try {
    await client.$queryRaw`SELECT pg_advisory_unlock(${workerTestLockKey}) AS released`;
  } finally {
    // Closing the session also drops any advisory lock it still holds.
    await client.$disconnect();
  }
}

function buildSingleConnectionUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}
