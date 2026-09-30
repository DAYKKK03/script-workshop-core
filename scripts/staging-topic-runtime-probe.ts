import { prisma } from "../lib/prisma.ts";

async function main() {
const recentSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const statuses = await prisma.topicGenerationJob.groupBy({
  by: ["status"],
  _count: { _all: true }
});
const recentOutcomes = await prisma.topicGenerationJob.groupBy({
  by: ["status", "errorCode"],
  where: { createdAt: { gte: recentSince } },
  _count: { _all: true }
});
const recentSequence = await prisma.$queryRaw<Array<{
  userKey: string;
  projectKey: string;
  status: string;
  createdAt: Date;
}>>`
  SELECT "userId" AS "userKey", "projectId" AS "projectKey", "status"::text, "createdAt"
  FROM "TopicGenerationJob"
  WHERE "createdAt" >= ${recentSince}
  ORDER BY "createdAt" ASC
  LIMIT 500
`;
const active = await prisma.topicGenerationJob.findFirst({
  where: { status: { in: ["queued", "processing"] } },
  orderBy: { createdAt: "asc" },
  select: { createdAt: true }
});
const databaseWaits = await prisma.$queryRaw<Array<{ waiting: bigint }>>`
  SELECT COUNT(*)::bigint AS waiting
  FROM pg_stat_activity
  WHERE datname = current_database() AND wait_event_type = 'Lock'
`;
const testUser = await prisma.user.findUnique({
  where: { account: "测试-1" },
  select: {
    dailyTopicLimit: true,
    dailyUsage: {
      orderBy: { usageDate: "desc" },
      take: 1,
      select: { usageDate: true, topicIdeasGenerated: true }
    }
  }
});
const previousByPair = new Map<string, { status: string; createdAt: Date }>();
let failedThenSucceededWithin30m = 0;
for (const job of recentSequence) {
  const pair = `${job.userKey}\u0000${job.projectKey}`;
  const previous = previousByPair.get(pair);
  if (
    job.status === "succeeded"
    && previous?.status === "failed"
    && job.createdAt.getTime() - previous.createdAt.getTime() <= 30 * 60 * 1000
  ) failedThenSucceededWithin30m += 1;
  previousByPair.set(pair, { status: job.status, createdAt: job.createdAt });
}

process.stdout.write(`${JSON.stringify({
  event: "topic_runtime_probe",
  statusCounts: Object.fromEntries(statuses.map((entry) => [entry.status, entry._count._all])),
  recentOutcomeCounts: recentOutcomes.map((entry) => ({
    status: entry.status,
    errorCode: entry.errorCode || "none",
    count: entry._count._all
  })),
  failedThenSucceededWithin30m,
  oldestActiveAgeSeconds: active ? Math.max(0, Math.round((Date.now() - active.createdAt.getTime()) / 1000)) : null,
  databaseLockWaiters: Number(databaseWaits[0]?.waiting ?? 0),
  testAccountQuota: testUser ? {
    limit: testUser.dailyTopicLimit,
    usageDate: testUser.dailyUsage[0]?.usageDate.toISOString().slice(0, 10) || null,
    successfulGenerations: testUser.dailyUsage[0]?.topicIdeasGenerated || 0
  } : null
})}\n`);

await prisma.$disconnect();
}

void main().catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "topic runtime probe failed"}\n`);
  await prisma.$disconnect();
  process.exitCode = 1;
});
