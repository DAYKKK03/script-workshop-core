import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calculateEstimatedCostMicros,
  getProviderPrices,
  getShanghaiUsageDate,
  hasReachedDailyScriptLimit,
  hasReachedDailyTopicLimit
} from "@/lib/usage/policy";

export class DailyScriptLimitError extends Error {
  constructor(public limit: number) {
    super("DAILY_SCRIPT_LIMIT_REACHED");
  }
}

export class DailyTopicLimitError extends Error {
  constructor(public limit: number) {
    super("DAILY_TOPIC_LIMIT_REACHED");
  }
}

type UsageIncrement = Partial<{
  scriptsGenerated: number;
  topicIdeasGenerated: number;
  deepseekRequests: number;
  deepseekSuccesses: number;
  deepseekFailures: number;
  deepseekInputTokens: number;
  deepseekOutputTokens: number;
  tikhubRequests: number;
  tikhubRetries: number;
  tikhubSuccesses: number;
  tikhubFailures: number;
  asrJobs: number;
  asrSuccesses: number;
  asrFailures: number;
  asrAudioSeconds: number;
}>;

export async function assertDailyScriptQuota(userId: string) {
  const usageDate = getShanghaiUsageDate();
  const [user, usage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { dailyScriptLimit: true, status: true }
    }),
    prisma.dailyUsage.findUnique({
      where: { userId_usageDate: { userId, usageDate } },
      select: { scriptsGenerated: true }
    })
  ]);

  if (!user || user.status !== "active") throw new DailyScriptLimitError(0);
  if (
    hasReachedDailyScriptLimit({
      scriptsGenerated: usage?.scriptsGenerated || 0,
      limit: user.dailyScriptLimit
    })
  ) {
    throw new DailyScriptLimitError(user.dailyScriptLimit);
  }
}

export async function recordSuccessfulScript(userId: string) {
  const usageDate = getShanghaiUsageDate();

  await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { dailyScriptLimit: true, status: true }
      });
      const usage = await tx.dailyUsage.findUnique({
        where: { userId_usageDate: { userId, usageDate } },
        select: { scriptsGenerated: true }
      });

      if (
        !user ||
        user.status !== "active" ||
        hasReachedDailyScriptLimit({
          scriptsGenerated: usage?.scriptsGenerated || 0,
          limit: user.dailyScriptLimit
        })
      ) {
        throw new DailyScriptLimitError(user?.dailyScriptLimit || 0);
      }

      await tx.dailyUsage.upsert({
        where: { userId_usageDate: { userId, usageDate } },
        create: { userId, usageDate, scriptsGenerated: 1 },
        update: { scriptsGenerated: { increment: 1 } }
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function assertDailyTopicQuota(userId: string) {
  const usageDate = getShanghaiUsageDate();
  const [user, usage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { dailyTopicLimit: true, status: true }
    }),
    prisma.dailyUsage.findUnique({
      where: { userId_usageDate: { userId, usageDate } },
      select: { topicIdeasGenerated: true }
    })
  ]);

  if (!user || user.status !== "active") throw new DailyTopicLimitError(0);
  if (
    hasReachedDailyTopicLimit({
      topicIdeasGenerated: usage?.topicIdeasGenerated || 0,
      limit: user.dailyTopicLimit
    })
  ) {
    throw new DailyTopicLimitError(user.dailyTopicLimit);
  }
}

/**
 * Records a complete 25-topic result under a serializable transaction so
 * concurrent successful requests cannot exceed the user's daily allowance.
 */
export async function recordSuccessfulTopicIdeas(userId: string) {
  const usageDate = getShanghaiUsageDate();

  await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { dailyTopicLimit: true, status: true }
      });
      const usage = await tx.dailyUsage.findUnique({
        where: { userId_usageDate: { userId, usageDate } },
        select: { topicIdeasGenerated: true }
      });

      if (
        !user ||
        user.status !== "active" ||
        hasReachedDailyTopicLimit({
          topicIdeasGenerated: usage?.topicIdeasGenerated || 0,
          limit: user.dailyTopicLimit
        })
      ) {
        throw new DailyTopicLimitError(user?.dailyTopicLimit || 0);
      }

      await tx.dailyUsage.upsert({
        where: { userId_usageDate: { userId, usageDate } },
        create: { userId, usageDate, topicIdeasGenerated: 1 },
        update: { topicIdeasGenerated: { increment: 1 } }
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function recordDeepSeekUsage({
  userId,
  success,
  inputTokens = 0,
  outputTokens = 0
}: {
  userId?: string;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
}) {
  if (!userId) return;
  await incrementDailyUsage(userId, {
    deepseekRequests: 1,
    deepseekSuccesses: success ? 1 : 0,
    deepseekFailures: success ? 0 : 1,
    deepseekInputTokens: inputTokens,
    deepseekOutputTokens: outputTokens
  });
}

export async function recordTikHubUsage({
  userId,
  success,
  attempts
}: {
  userId?: string;
  success: boolean;
  attempts: number;
}) {
  if (!userId) return;
  await incrementDailyUsage(userId, {
    tikhubRequests: Math.max(1, attempts),
    tikhubRetries: Math.max(0, attempts - 1),
    tikhubSuccesses: success ? 1 : 0,
    tikhubFailures: success ? 0 : 1
  });
}

export async function recordAsrUsage({
  userId,
  success,
  audioSeconds = 0
}: {
  userId?: string;
  success: boolean;
  audioSeconds?: number;
}) {
  if (!userId) return;
  await incrementDailyUsage(userId, {
    asrJobs: 1,
    asrSuccesses: success ? 1 : 0,
    asrFailures: success ? 0 : 1,
    asrAudioSeconds: Math.max(0, Math.round(audioSeconds))
  });
}

async function incrementDailyUsage(userId: string, increment: UsageIncrement) {
  const usageDate = getShanghaiUsageDate();
  const prices = await getConfiguredProviderPrices();
  const estimatedCostMicros = calculateEstimatedCostMicros({
    deepseekInputTokens: increment.deepseekInputTokens,
    deepseekOutputTokens: increment.deepseekOutputTokens,
    asrAudioSeconds: increment.asrAudioSeconds,
    tikhubRequests: increment.tikhubRequests,
    prices
  });
  const create = { userId, usageDate, ...increment, estimatedCostMicros };
  const update = Object.fromEntries(
    Object.entries({ ...increment, estimatedCostMicros }).map(([key, value]) => [
      key,
      { increment: value || 0 }
    ])
  );

  await prisma.dailyUsage.upsert({
    where: { userId_usageDate: { userId, usageDate } },
    create,
    update
  });
}

export async function getConfiguredProviderPrices() {
  const configured = await prisma.costConfiguration.findUnique({
    where: { id: "default" }
  });
  return configured
    ? {
        deepseekInputCnyPerMillion: configured.deepseekInputCnyPerMillion,
        deepseekOutputCnyPerMillion: configured.deepseekOutputCnyPerMillion,
        asrCnyPerHour: configured.asrCnyPerHour,
        tikhubCnyPerRequest: configured.tikhubCnyPerRequest
      }
    : getProviderPrices();
}
