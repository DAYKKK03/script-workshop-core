import { createHash } from "node:crypto";
import { Prisma, type CustomScriptGenerationJobStatus } from "@prisma/client";
import {
  canonicalCustomScriptInputHash,
  CustomScriptValidationError,
  validateCustomScriptRequestBody,
  type MissingFactCode,
  type ValidatedCustomScriptInput
} from "@/lib/custom-scripts/contracts";
import {
  CUSTOM_SCRIPT_HOURLY_LIMIT,
  CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT,
  customScriptRunDeadline,
  customScriptTerminalExpiry
} from "@/lib/custom-scripts/job-policy";
import {
  parseCustomScriptQualityFallback,
  type CustomScriptQualityFallback
} from "@/lib/custom-scripts/quality-fallback";
import { prisma } from "@/lib/prisma";
import { getProjectForUser } from "@/lib/projects/service";
import { buildRateLimitKey, getRateLimitWindow } from "@/lib/security/rate-limit-policy";
import { getShanghaiUsageDate, hasReachedDailyScriptLimit } from "@/lib/usage/policy";
import { assertDailyScriptQuota, DailyScriptLimitError } from "@/lib/usage/service";

const terminalStatuses: CustomScriptGenerationJobStatus[] = ["succeeded", "needs_profile", "failed", "canceled"];

export class CustomScriptGenerationJobError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export type SerializedCustomScriptJob = {
  id: string;
  status: CustomScriptGenerationJobStatus;
  createdAt: string;
  runDeadlineAt: string;
  finishedAt?: string;
  expiresAt?: string;
  result?:
    | { status: "success"; finalScript: string; characterCount: number; inputType: "brief" | "topic" | "top_pick" }
    | { status: "needs_profile"; missingFacts: MissingFactCode[] };
  errorCode?: string;
  message?: string;
};

export async function createCustomScriptGenerationJob(input: {
  userId: string;
  body: Record<string, unknown>;
}): Promise<SerializedCustomScriptJob> {
  let validated: ValidatedCustomScriptInput;
  try {
    validated = validateCustomScriptRequestBody(input.body);
  } catch (error) {
    if (error instanceof CustomScriptValidationError) {
      throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_INPUT_INVALID", "脚本需求格式无效，请检查后重试", 400);
    }
    throw error;
  }
  const inputHash = canonicalCustomScriptInputHash(validated);
  const existing = await prisma.customScriptGenerationJob.findUnique({
    where: { userId_clientRequestId: { userId: input.userId, clientRequestId: validated.clientRequestId } }
  });
  if (existing) return serializeIdempotentJob(existing, inputHash);

  const project = await getProjectForUser(validated.projectId, input.userId);
  if (validated.sourceProjectId && (!project || validated.sourceProjectId !== validated.projectId)) {
    throw new CustomScriptGenerationJobError(
      "CUSTOM_SCRIPT_PROJECT_SOURCE_MISMATCH",
      "选题来源与当前商家项目不一致，请切换项目或重新复制",
      409
    );
  }
  if (!project) throw new CustomScriptGenerationJobError("PROJECT_NOT_FOUND", "商家项目不存在", 404);
  try {
    await assertDailyScriptQuota(input.userId);
  } catch (error) {
    if (error instanceof DailyScriptLimitError) {
      throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_DAILY_LIMIT_REACHED", "今日脚本额度已用完，请明日再试", 429);
    }
    throw error;
  }

  const now = new Date();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const job = await prisma.$transaction(async (tx) => {
        const duplicate = await tx.customScriptGenerationJob.findUnique({
          where: { userId_clientRequestId: { userId: input.userId, clientRequestId: validated.clientRequestId } }
        });
        if (duplicate) return serializeIdempotentJob(duplicate, inputHash);
        const active = await tx.customScriptGenerationJob.count({
          where: { userId: input.userId, status: { in: ["queued", "processing"] } }
        });
        if (active > 0) {
          throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_ALREADY_RUNNING", "当前已有定制脚本任务正在处理", 409);
        }
        await consumeHourlyCreation(tx, input.userId, now);
        const created = await tx.customScriptGenerationJob.create({
          data: {
            userId: input.userId,
            projectId: validated.projectId,
            clientRequestId: validated.clientRequestId,
            inputHash,
            input: validated as unknown as Prisma.InputJsonValue,
            runDeadlineAt: customScriptRunDeadline(now)
          }
        });
        return serializeCustomScriptJob(created);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 1_500,
        timeout: 4_000
      });
      return job;
    } catch (error) {
      if (error instanceof CustomScriptGenerationJobError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await prisma.customScriptGenerationJob.findUnique({
          where: { userId_clientRequestId: { userId: input.userId, clientRequestId: validated.clientRequestId } }
        });
        if (duplicate) return serializeIdempotentJob(duplicate, inputHash);
        throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_ALREADY_RUNNING", "当前已有定制脚本任务正在处理", 409);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") {
        throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_CREATE_BUSY", "任务创建繁忙，请使用原请求重试", 503);
      }
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_CREATE_BUSY", "任务创建繁忙，请使用原请求重试", 503);
}

export async function getCustomScriptGenerationJobForUser(jobId: string, userId: string) {
  await reconcileCustomScriptDeadlines();
  const job = await prisma.customScriptGenerationJob.findFirst({ where: { id: jobId, userId } });
  if (!job) throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_JOB_NOT_FOUND", "任务不存在", 404);
  if (job.expiresAt && job.expiresAt <= new Date()) {
    throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_JOB_EXPIRED", "任务结果已过期，请重新生成", 410);
  }
  return serializeCustomScriptJob(job);
}

export async function getCurrentCustomScriptGenerationJobForUser(userId: string) {
  await reconcileCustomScriptDeadlines();
  const now = new Date();
  const job = await prisma.customScriptGenerationJob.findFirst({
    where: {
      userId,
      OR: [
        { status: { in: ["queued", "processing"] } },
        { status: { in: terminalStatuses }, expiresAt: { gt: now } }
      ]
    },
    orderBy: { createdAt: "desc" }
  });
  return job ? serializeCustomScriptJob(job) : null;
}

/** Cancellation and completion use mutually exclusive conditional transitions. */
export async function cancelCustomScriptGenerationJobForUser(jobId: string, userId: string) {
  const finishedAt = new Date();
  const canceled = await prisma.customScriptGenerationJob.updateMany({
    where: { id: jobId, userId, status: { in: ["queued", "processing"] }, quotaChargedAt: null },
    data: terminalData("canceled", finishedAt, "CUSTOM_SCRIPT_CANCELED")
  });
  if (canceled.count === 1) return { id: jobId, status: "canceled" as const };
  const job = await prisma.customScriptGenerationJob.findFirst({ where: { id: jobId, userId } });
  if (!job) throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_JOB_NOT_FOUND", "任务不存在", 404);
  if (job.status === "succeeded" || job.quotaChargedAt) {
    throw new CustomScriptGenerationJobError("CUSTOM_SCRIPT_ALREADY_COMPLETED", "任务已经完成，不能取消", 409);
  }
  return { id: job.id, status: job.status };
}

export async function reconcileCustomScriptDeadlines(now = new Date()) {
  const finished = await prisma.customScriptGenerationJob.findMany({
    where: { status: { in: ["queued", "processing"] }, runDeadlineAt: { lte: now }, quotaChargedAt: null },
    select: { id: true }
  });
  if (finished.length) {
    await prisma.customScriptGenerationJob.updateMany({
      where: { id: { in: finished.map((job) => job.id) }, status: { in: ["queued", "processing"] }, quotaChargedAt: null },
      data: terminalData("failed", now, "CUSTOM_SCRIPT_RUN_TIMEOUT")
    });
  }
  await cleanupExpiredCustomScriptJobs(now);
}

export async function cleanupExpiredCustomScriptJobs(now = new Date()) {
  await prisma.customScriptGenerationJob.deleteMany({
    where: { status: { in: terminalStatuses }, expiresAt: { lte: now } }
  });
}

export type CustomScriptCompletionOutcome = "completed" | "daily_limit" | "lease_lost";

export async function completeCustomScriptSuccess(input: {
  jobId: string;
  userId: string;
  leaseToken: string;
  result: Prisma.InputJsonValue;
}): Promise<CustomScriptCompletionOutcome> {
  const usageDate = getShanghaiUsageDate();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        const locked = await tx.customScriptGenerationJob.findFirst({
          where: {
            id: input.jobId,
            userId: input.userId,
            status: "processing",
            lockedBy: input.leaseToken,
            quotaChargedAt: null,
            runDeadlineAt: { gt: now }
          },
          select: { id: true }
        });
        if (!locked) return "lease_lost";
        const [user, usage] = await Promise.all([
          tx.user.findUnique({ where: { id: input.userId }, select: { dailyScriptLimit: true, status: true } }),
          tx.dailyUsage.findUnique({
            where: { userId_usageDate: { userId: input.userId, usageDate } },
            select: { scriptsGenerated: true }
          })
        ]);
        if (!user || user.status !== "active" || hasReachedDailyScriptLimit({
          scriptsGenerated: usage?.scriptsGenerated || 0,
          limit: user.dailyScriptLimit
        })) {
          const failedForQuota = await tx.customScriptGenerationJob.updateMany({
            where: {
              id: input.jobId,
              status: "processing",
              lockedBy: input.leaseToken,
              quotaChargedAt: null,
              runDeadlineAt: { gt: now }
            },
            data: terminalData("failed", now, "CUSTOM_SCRIPT_DAILY_LIMIT_REACHED")
          });
          return failedForQuota.count === 1 ? "daily_limit" : "lease_lost";
        }
        const completed = await tx.customScriptGenerationJob.updateMany({
          where: {
            id: input.jobId,
            status: "processing",
            lockedBy: input.leaseToken,
            quotaChargedAt: null,
            runDeadlineAt: { gt: now }
          },
          data: {
            ...terminalData("succeeded", now, null),
            result: input.result,
            quotaChargedAt: now
          }
        });
        if (completed.count !== 1) return "lease_lost";
        await tx.dailyUsage.upsert({
          where: { userId_usageDate: { userId: input.userId, usageDate } },
          create: { userId: input.userId, usageDate, scriptsGenerated: 1 },
          update: { scriptsGenerated: { increment: 1 } }
        });
        return "completed";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  return "lease_lost";
}

export async function completeCustomScriptNeedsProfile(input: {
  jobId: string;
  leaseToken: string;
  missingFacts: MissingFactCode[];
}) {
  const now = new Date();
  return (await prisma.customScriptGenerationJob.updateMany({
    where: { id: input.jobId, status: "processing", lockedBy: input.leaseToken, runDeadlineAt: { gt: now } },
    data: {
      ...terminalData("needs_profile", now, null),
      result: { status: "needs_profile", missingFacts: input.missingFacts }
    }
  })).count === 1;
}

export async function failCustomScriptJob(jobId: string, leaseToken: string, errorCode: string) {
  const now = new Date();
  return (await prisma.customScriptGenerationJob.updateMany({
    where: { id: jobId, status: "processing", lockedBy: leaseToken, quotaChargedAt: null },
    data: terminalData("failed", now, errorCode)
  })).count === 1;
}

export async function customScriptJobIsOwned(jobId: string, leaseToken: string) {
  return await prisma.customScriptGenerationJob.count({
    where: { id: jobId, status: "processing", lockedBy: leaseToken, runDeadlineAt: { gt: new Date() } }
  }) === 1;
}

/** Durably records a safe short draft before any optional quality provider call is reserved. */
export async function persistCustomScriptQualityFallback(input: {
  jobId: string;
  leaseToken: string;
  fallback: CustomScriptQualityFallback;
}) {
  const now = new Date();
  return (await prisma.customScriptGenerationJob.updateMany({
    where: {
      id: input.jobId,
      status: "processing",
      lockedBy: input.leaseToken,
      runDeadlineAt: { gt: now },
      providerCallsStarted: 1
    },
    data: { result: input.fallback as Prisma.InputJsonObject }
  })).count === 1;
}

export async function failStaleExhaustedCustomScriptJobs(ids: string[], staleBefore: Date, now = new Date()) {
  if (!ids.length) return;
  const candidates = await prisma.customScriptGenerationJob.findMany({
    where: {
      id: { in: ids },
      status: "processing",
      lockedAt: { lte: staleBefore },
      providerCallsStarted: { gte: 2 },
      quotaChargedAt: null
    },
    select: { id: true, result: true, providerCallsStarted: true }
  });
  await Promise.all(candidates.map(async (candidate) => {
    if (
      candidate.providerCallsStarted === CUSTOM_SCRIPT_JOB_PROVIDER_CALL_LIMIT
      && parseCustomScriptQualityFallback(candidate.result)
    ) return;
    await prisma.customScriptGenerationJob.updateMany({
      where: {
        id: candidate.id,
        status: "processing",
        lockedAt: { lte: staleBefore },
        providerCallsStarted: { gte: 2 },
        quotaChargedAt: null,
        result: { equals: candidate.result === null ? Prisma.DbNull : candidate.result }
      },
      data: terminalData("failed", now, "CUSTOM_SCRIPT_OUTPUT_INVALID")
    });
  }));
}

function terminalData(status: CustomScriptGenerationJobStatus, finishedAt: Date, errorCode: string | null) {
  return {
    status,
    errorCode,
    projectId: null,
    input: Prisma.DbNull,
    result: Prisma.DbNull,
    lockedAt: null,
    lockedBy: null,
    finishedAt,
    expiresAt: customScriptTerminalExpiry(finishedAt)
  } satisfies Prisma.CustomScriptGenerationJobUncheckedUpdateManyInput;
}

function serializeIdempotentJob(
  job: Parameters<typeof serializeCustomScriptJob>[0],
  expectedHash: string
) {
  if (job.inputHash !== expectedHash) {
    throw new CustomScriptGenerationJobError(
      "CUSTOM_SCRIPT_IDEMPOTENCY_CONFLICT",
      "同一请求标识不能用于不同生成条件",
      409
    );
  }
  return serializeCustomScriptJob(job);
}

function serializeCustomScriptJob(job: {
  id: string;
  status: CustomScriptGenerationJobStatus;
  inputHash: string;
  result: Prisma.JsonValue | null;
  errorCode: string | null;
  createdAt: Date;
  runDeadlineAt: Date;
  finishedAt: Date | null;
  expiresAt: Date | null;
}): SerializedCustomScriptJob {
  const parsedResult = parseStoredCustomScriptPublicResult(job.result);
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    runDeadlineAt: job.runDeadlineAt.toISOString(),
    ...(job.finishedAt ? { finishedAt: job.finishedAt.toISOString() } : {}),
    ...(job.expiresAt ? { expiresAt: job.expiresAt.toISOString() } : {}),
    ...(parsedResult ? { result: parsedResult } : {}),
    ...(job.status === "failed" ? {
      errorCode: job.errorCode || "CUSTOM_SCRIPT_OUTPUT_INVALID",
      message: customScriptFailureMessage(job.errorCode)
    } : {})
  };
}

export function parseStoredCustomScriptPublicResult(
  value: Prisma.JsonValue | null
): SerializedCustomScriptJob["result"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.status === "success" &&
    typeof candidate.finalScript === "string" &&
    typeof candidate.characterCount === "number" &&
    ["brief", "topic", "top_pick"].includes(String(candidate.inputType))
  ) return candidate as NonNullable<SerializedCustomScriptJob["result"]>;
  if (
    candidate.status === "needs_profile" &&
    Array.isArray(candidate.missingFacts)
  ) return candidate as NonNullable<SerializedCustomScriptJob["result"]>;
  return undefined;
}

function customScriptFailureMessage(errorCode: string | null) {
  if (errorCode === "CUSTOM_SCRIPT_DAILY_LIMIT_REACHED") return "今日脚本额度已用完，本次未保存结果";
  if (errorCode === "CUSTOM_SCRIPT_RUN_TIMEOUT") return "AI生成超时，本次未扣额度，请重新生成";
  if (errorCode === "CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE") return "AI服务暂时不可用，本次未扣额度，请稍后重试";
  if (errorCode === "CUSTOM_SCRIPT_OUTPUT_INVALID") return "AI返回内容未通过校验，本次未扣额度，请换个说法重试";
  return "脚本生成失败，本次未扣额度，请稍后重试";
}

async function consumeHourlyCreation(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("RATE_LIMIT_SECRET is not configured");
  const scope = "custom-script-create-user";
  const window = getRateLimitWindow({ now, windowMs: 60 * 60_000 });
  const keyHash = buildRateLimitKey({
    scope,
    identity: `${userId}:${window.startedAt.toISOString()}`,
    secret
  });
  const bucket = await tx.rateLimitBucket.upsert({
    where: { keyHash },
    create: { keyHash, scope, windowStartedAt: window.startedAt, expiresAt: window.expiresAt, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true }
  });
  if (bucket.count > CUSTOM_SCRIPT_HOURLY_LIMIT) {
    throw new CustomScriptGenerationJobError(
      "CUSTOM_SCRIPT_HOURLY_LIMIT_REACHED",
      "定制脚本生成过于频繁，请稍后再试",
      429
    );
  }
}

export function hashCustomScriptIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
