import { prisma } from "@/lib/prisma";
import { getShanghaiUsageDate } from "@/lib/usage/policy";

export async function getAdminOverview(days = 30) {
  const today = getShanghaiUsageDate();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - Math.max(0, days - 1));

  const [todayUsage, activeAccounts, inviteGroups, trendRows, queueGroups] = await Promise.all([
    prisma.dailyUsage.aggregate({
      where: { usageDate: today },
      _sum: usageSumSelection
    }),
    prisma.dailyUsage.count({
      where: {
        usageDate: today,
        OR: [
          { scriptsGenerated: { gt: 0 } },
          { topicIdeasGenerated: { gt: 0 } }
        ]
      }
    }),
    prisma.inviteCode.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.dailyUsage.groupBy({
      by: ["usageDate"],
      where: { usageDate: { gte: since } },
      _sum: usageSumSelection,
      orderBy: { usageDate: "asc" }
    }),
    prisma.extractionJob.groupBy({ by: ["status"], _count: { _all: true } })
  ]);

  return {
    today: normalizeUsageSums(todayUsage._sum),
    activeAccounts,
    invites: Object.fromEntries(inviteGroups.map((row) => [row.status, row._count._all])),
    queue: Object.fromEntries(queueGroups.map((row) => [row.status, row._count._all])),
    trend: trendRows.map((row) => ({
      date: row.usageDate.toISOString().slice(0, 10),
      ...normalizeUsageSums(row._sum)
    }))
  };
}

export async function getAccountUsage() {
  const today = getShanghaiUsageDate();
  const since30 = new Date(today);
  since30.setUTCDate(since30.getUTCDate() - 29);
  const since7 = new Date(today);
  since7.setUTCDate(since7.getUTCDate() - 6);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      account: true,
      status: true,
      dailyScriptLimit: true,
      dailyTopicLimit: true,
      createdAt: true,
      dailyUsage: {
        where: { usageDate: { gte: since30 } },
        select: {
          usageDate: true,
          scriptsGenerated: true,
          topicIdeasGenerated: true,
          deepseekInputTokens: true,
          deepseekOutputTokens: true,
          tikhubRequests: true,
          asrAudioSeconds: true,
          estimatedCostMicros: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return users.map((user) => ({
    id: user.id,
    account: user.account,
    status: user.status,
    dailyScriptLimit: user.dailyScriptLimit,
    dailyTopicLimit: user.dailyTopicLimit,
    today: sumAccountRows(user.dailyUsage.filter((row) => row.usageDate >= today)),
    sevenDays: sumAccountRows(user.dailyUsage.filter((row) => row.usageDate >= since7)),
    thirtyDays: sumAccountRows(user.dailyUsage)
  }));
}

const usageSumSelection = {
  scriptsGenerated: true,
  topicIdeasGenerated: true,
  deepseekRequests: true,
  deepseekInputTokens: true,
  deepseekOutputTokens: true,
  tikhubRequests: true,
  asrJobs: true,
  asrAudioSeconds: true,
  estimatedCostMicros: true
} as const;

function normalizeUsageSums(value: Record<string, number | null>) {
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, count || 0]));
}

function sumAccountRows(rows: Array<{
  scriptsGenerated: number;
  topicIdeasGenerated: number;
  deepseekInputTokens: number;
  deepseekOutputTokens: number;
  tikhubRequests: number;
  asrAudioSeconds: number;
  estimatedCostMicros: number;
}>) {
  return rows.reduce(
    (total, row) => ({
      scripts: total.scripts + row.scriptsGenerated,
      topics: total.topics + row.topicIdeasGenerated,
      deepseekTokens: total.deepseekTokens + row.deepseekInputTokens + row.deepseekOutputTokens,
      tikhubRequests: total.tikhubRequests + row.tikhubRequests,
      asrSeconds: total.asrSeconds + row.asrAudioSeconds,
      costMicros: total.costMicros + row.estimatedCostMicros
    }),
    { scripts: 0, topics: 0, deepseekTokens: 0, tikhubRequests: 0, asrSeconds: 0, costMicros: 0 }
  );
}
