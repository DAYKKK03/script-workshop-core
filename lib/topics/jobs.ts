import { createHash } from "crypto";
import { Prisma, type TopicGenerationJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProjectForUser } from "@/lib/projects/service";
import { getShanghaiUsageDate, hasReachedDailyTopicLimit } from "@/lib/usage/policy";
import { DailyTopicLimitError, assertDailyTopicQuota } from "@/lib/usage/service";
import { generateTopics, type TopicFailureDiagnostic } from "@/lib/topics/service-runtime";
import { validateGenerationInput } from "@/lib/topics/validation";
import type { TopicGeneration } from "@/lib/topics/types";
import {
  canRequeueRecoverableTopicFailure,
  getTopicJobHeartbeatIntervalMs,
  getTopicJobRetryMinimumRemainingMs,
  getTopicJobRunTimeoutMs,
  getTopicJobTtlMs,
  topicRemainingBudgetBucket
} from "@/lib/topics/job-policy";

const safeFailureMessage = "选题生成失败，请稍后重试";

export class TopicGenerationJobError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export type SerializedTopicGenerationJob = {
  id: string;
  status: TopicGenerationJobStatus;
  createdAt?: string;
  runDeadlineAt?: string;
  projectId?: string;
  analyzedProjectUpdatedAt?: string;
  track?: string;
  keywords?: string[];
  audienceScenes?: string[];
  message?: string;
  ideas?: TopicGeneration["ideas"];
  topPicks?: TopicGeneration["topPicks"];
};

export async function createTopicGenerationJob(input: {
  userId: string;
  body: Record<string, unknown>;
}): Promise<SerializedTopicGenerationJob> {
  const clientRequestId = normalizeTopicClientRequestId(input.body.clientRequestId);
  const existing = await prisma.topicGenerationJob.findUnique({
    where: { userId_clientRequestId: { userId: input.userId, clientRequestId } },
    select: { id: true, status: true }
  });
  if (existing) return existing;
  const validated = validateGenerationInput(input.body);
  const project = await getProjectForUser(validated.projectId, input.userId);
  if (!project) throw new TopicGenerationJobError("PROJECT_NOT_FOUND", "商家项目不存在", 404);
  if (project.updatedAt.toISOString() !== new Date(validated.analyzedProjectUpdatedAt).toISOString()) {
    throw new TopicGenerationJobError("PROJECT_PROFILE_CHANGED", "商家资料已更新，请重新分析后再生成", 409);
  }
  await assertDailyTopicQuota(input.userId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const job = await prisma.$transaction(async (tx) => {
        const active = await tx.topicGenerationJob.count({
          where: { userId: input.userId, status: { in: ["queued", "processing"] } }
        });
        if (active >= 1) {
          throw new TopicGenerationJobError(
            "TOPIC_JOB_CONCURRENCY_LIMIT",
            "当前已有选题任务正在处理，请稍后再试",
            429
          );
        }
        return tx.topicGenerationJob.create({
          data: {
            userId: input.userId,
            projectId: validated.projectId,
            clientRequestId,
            input: validated as unknown as Prisma.InputJsonValue,
            runDeadlineAt: new Date(Date.now() + getTopicJobRunTimeoutMs()),
            expiresAt: new Date(Date.now() + getTopicJobTtlMs())
          },
          select: { id: true, status: true }
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 1_500,
        timeout: 4_000
      });
      return job;
    } catch (error) {
      if (error instanceof TopicGenerationJobError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await prisma.topicGenerationJob.findUnique({
          where: { userId_clientRequestId: { userId: input.userId, clientRequestId } },
          select: { id: true, status: true }
        });
        if (duplicate) return duplicate;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") {
        throw new TopicGenerationJobError("TOPIC_JOB_CREATE_BUSY", "任务创建繁忙，请稍后重试", 503);
      }
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new TopicGenerationJobError("TOPIC_JOB_CONCURRENCY_LIMIT", "当前已有选题任务正在处理，请稍后再试", 429);
}

export async function getTopicGenerationJobForUser(jobId: string, userId: string) {
  await reconcileTopicJobDeadlines();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx): Promise<SerializedTopicGenerationJob> => {
        const job = await tx.topicGenerationJob.findFirst({
          where: { id: jobId, userId },
          select: { id: true, status: true, result: true, errorCode: true }
        });
        if (!job) throw new TopicGenerationJobError("TOPIC_JOB_NOT_FOUND", "任务不存在", 404);
        if (job.status === "succeeded") {
          const result = parseStoredResult(job.result);
          if (!result) return { id: job.id, status: "failed", message: safeFailureMessage };
          const cleared = await tx.topicGenerationJob.updateMany({
            where: { id: job.id, userId, status: "succeeded", result: { not: Prisma.DbNull } },
            data: { input: Prisma.DbNull, result: Prisma.DbNull }
          });
          if (cleared.count !== 1) throw new TopicGenerationJobError("TOPIC_JOB_RESULT_CONSUMED", "生成结果已读取", 410);
          return { id: job.id, status: "succeeded", ...result };
        }
        if (job.status === "failed") return { id: job.id, status: "failed", message: topicFailureMessage(job.errorCode) };
        return { id: job.id, status: job.status };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof TopicGenerationJobError) throw error;
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new TopicGenerationJobError("TOPIC_JOB_NOT_FOUND", "任务不存在", 404);
}

/** Returns the user's one resumable job without exposing any other user's state. */
export async function getActiveTopicGenerationJobForUser(userId: string): Promise<SerializedTopicGenerationJob | null> {
  await reconcileTopicJobDeadlines();
  const job = await prisma.topicGenerationJob.findFirst({
    where: { userId, status: { in: ["queued", "processing"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, projectId: true, input: true, createdAt: true, runDeadlineAt: true }
  });
  if (!job || !isInput(job.input)) return null;
  const input = job.input as Record<string, unknown>;
  const track = stringValue(input.track);
  const analyzedProjectUpdatedAt = stringValue(input.analyzedProjectUpdatedAt);
  const keywords = stringArray(input.keywords);
  const audienceScenes = stringArray(input.audienceScenes);
  if (!track || !analyzedProjectUpdatedAt || keywords?.length !== 5 || audienceScenes?.length !== 5) return null;
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    runDeadlineAt: job.runDeadlineAt.toISOString(),
    projectId: job.projectId,
    analyzedProjectUpdatedAt,
    track,
    keywords,
    audienceScenes
  };
}

/** Cancellation is a conditional terminal transition, so a completing worker cannot also win. */
export async function cancelTopicGenerationJobForUser(jobId: string, userId: string) {
  const canceled = await prisma.topicGenerationJob.updateMany({
    where: { id: jobId, userId, status: { in: ["queued", "processing"] }, quotaChargedAt: null },
    data: { status: "canceled", errorCode: "TOPIC_JOB_CANCELED", input: Prisma.DbNull, result: Prisma.DbNull, lockedAt: null, lockedBy: null }
  });
  if (canceled.count === 1) return { id: jobId, status: "canceled" as const };
  const job = await prisma.topicGenerationJob.findFirst({ where: { id: jobId, userId }, select: { status: true, quotaChargedAt: true } });
  if (!job) throw new TopicGenerationJobError("TOPIC_JOB_NOT_FOUND", "任务不存在", 404);
  if (job.status === "succeeded" || job.quotaChargedAt) throw new TopicGenerationJobError("TOPIC_JOB_ALREADY_COMPLETED", "任务已经完成，不能取消", 409);
  return { id: jobId, status: job.status };
}

export async function processClaimedTopicJob(jobId: string, workerId: string) {
  const startedAt = Date.now();
  const job = await prisma.topicGenerationJob.findUnique({
    where: { id: jobId },
    select: { id: true, userId: true, status: true, input: true, lockedBy: true, runDeadlineAt: true, attemptCount: true, maxAttempts: true }
  });
  if (!job || job.status !== "processing" || job.lockedBy !== workerId) return;
  if (job.runDeadlineAt <= new Date() || !isInput(job.input)) {
    const failure = await handleTopicJobFailure({ jobId: job.id, workerId, errorCode: "TOPIC_JOB_INVALID_OR_EXPIRED" });
    logTopicJobOutcome(failure === "requeued" ? "topic_generation_requeued" : "topic_generation_failed", "TOPIC_JOB_INVALID_OR_EXPIRED", startedAt, undefined, job);
    return;
  }

  try {
    const result = await withTopicJobHeartbeat(job.id, workerId, () =>
      generateTopics({
        userId: job.userId,
        body: job.input as Record<string, unknown>,
        recordSuccess: false,
        deadlineAt: job.runDeadlineAt.getTime(),
        shouldContinue: () => topicJobIsStillOwned(job.id, workerId)
      })
    );
    if (result.status !== "success") {
      const failure = await handleTopicJobFailure({ jobId: job.id, workerId, errorCode: result.errorCode });
      logTopicJobOutcome(failure === "requeued" ? "topic_generation_requeued" : "topic_generation_failed", result.errorCode, startedAt, result.diagnostic, job);
      return;
    }
    const completion = await completeTopicJobAndChargeQuota(job.id, job.userId, workerId, { ideas: result.ideas, topPicks: result.topPicks });
    logTopicJobOutcome(completion === "completed" ? "topic_generation_succeeded" : "topic_generation_completion_lost", completion === "quota_rejected" ? "DAILY_TOPIC_LIMIT_REACHED" : undefined, startedAt, result.diagnostic, job);
  } catch (error) {
    const errorCode = error instanceof DailyTopicLimitError ? "DAILY_TOPIC_LIMIT_REACHED" : "TOPIC_GENERATE_FAILED";
    const failure = await handleTopicJobFailure({ jobId: job.id, workerId, errorCode });
    logTopicJobOutcome(failure === "requeued" ? "topic_generation_requeued" : "topic_generation_failed", errorCode, startedAt, undefined, job);
  }
}

async function withTopicJobHeartbeat<T>(jobId: string, workerId: string, task: () => Promise<T>) {
  let stopped = false;
  let pending: Promise<unknown> | null = null;
  const timer = setInterval(() => {
    if (stopped || pending) return;
    pending = prisma.topicGenerationJob.updateMany({
      where: { id: jobId, status: "processing", lockedBy: workerId },
      data: { lockedAt: new Date() }
    }).finally(() => { pending = null; });
  }, getTopicJobHeartbeatIntervalMs());
  timer.unref?.();
  try {
    return await task();
  } finally {
    stopped = true;
    clearInterval(timer);
    const finalPending = pending as Promise<unknown> | null;
    await finalPending?.catch(() => undefined);
  }
}

/** Completes a claimed job and charges daily quota exactly once in the same transaction. */
export async function completeTopicJobAndChargeQuota(jobId: string, userId: string, workerId: string, result: TopicGeneration): Promise<"completed" | "quota_rejected" | "lease_lost"> {
  const usageDate = getShanghaiUsageDate();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const locked = await tx.topicGenerationJob.findFirst({
          where: {
            id: jobId,
            status: "processing",
            lockedBy: workerId,
            quotaChargedAt: null,
            runDeadlineAt: { gt: new Date() }
          },
          select: { id: true }
        });
        if (!locked) return "lease_lost" as const;
        const user = await tx.user.findUnique({ where: { id: userId }, select: { dailyTopicLimit: true, status: true } });
        const usage = await tx.dailyUsage.findUnique({
          where: { userId_usageDate: { userId, usageDate } }, select: { topicIdeasGenerated: true }
        });
        if (!user || user.status !== "active" || hasReachedDailyTopicLimit({ topicIdeasGenerated: usage?.topicIdeasGenerated || 0, limit: user.dailyTopicLimit })) {
          await tx.topicGenerationJob.update({ where: { id: jobId }, data: { status: "failed", errorCode: "DAILY_TOPIC_LIMIT_REACHED", input: Prisma.DbNull, result: Prisma.DbNull, lockedAt: null, lockedBy: null } });
          return "quota_rejected" as const;
        }
        const completed = await tx.topicGenerationJob.updateMany({
          where: { id: jobId, status: "processing", lockedBy: workerId, quotaChargedAt: null, runDeadlineAt: { gt: new Date() } },
          data: { status: "succeeded", errorCode: null, quotaChargedAt: new Date(), result: result as unknown as Prisma.InputJsonValue, lockedAt: null, lockedBy: null }
        });
        if (completed.count !== 1) return "lease_lost" as const;
        await tx.dailyUsage.upsert({
          where: { userId_usageDate: { userId, usageDate } },
          create: { userId, usageDate, topicIdeasGenerated: 1 },
          update: { topicIdeasGenerated: { increment: 1 } }
        });
        return "completed" as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return outcome;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  return "lease_lost";
}

/**
 * Atomically returns one owned first attempt to the queue only for a known transient
 * Provider/format failure. Crash recovery remains solely in the worker module.
 */
export async function handleTopicJobFailure(input: {
  jobId: string;
  workerId: string;
  errorCode: string;
  now?: Date;
  /** @internal Test-only synchronization point for conditional-update fencing. */
  afterRead?: () => Promise<void>;
}) {
  const now = input.now || new Date();
  const job = await prisma.topicGenerationJob.findFirst({
    where: { id: input.jobId, status: "processing", lockedBy: input.workerId, quotaChargedAt: null },
    select: { id: true, attemptCount: true, maxAttempts: true, runDeadlineAt: true }
  });
  if (!job) return "lease_lost" as const;
  await input.afterRead?.();

  if (canRequeueRecoverableTopicFailure({ ...job, errorCode: input.errorCode, now })) {
    const requeued = await prisma.topicGenerationJob.updateMany({
      where: {
        id: job.id,
        status: "processing",
        lockedBy: input.workerId,
        quotaChargedAt: null,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        runDeadlineAt: { gt: new Date(now.getTime() + getTopicJobRetryMinimumRemainingMs()) }
      },
      data: { status: "queued", availableAt: now, errorCode: null, lockedAt: null, lockedBy: null }
    });
    if (requeued.count === 1) return "requeued" as const;
  }

  const terminalErrorCode = job.runDeadlineAt.getTime() - now.getTime() <= getTopicJobRetryMinimumRemainingMs()
    ? "TOPIC_JOB_TIMED_OUT"
    : input.errorCode;
  const failed = await prisma.topicGenerationJob.updateMany({
    where: { id: job.id, status: "processing", lockedBy: input.workerId, quotaChargedAt: null, attemptCount: job.attemptCount },
    data: { status: "failed", errorCode: terminalErrorCode, input: Prisma.DbNull, result: Prisma.DbNull, lockedAt: null, lockedBy: null }
  });
  return failed.count === 1 ? "failed" as const : "lease_lost" as const;
}

async function topicJobIsStillOwned(jobId: string, workerId: string) {
  return await prisma.topicGenerationJob.count({
    where: { id: jobId, status: "processing", lockedBy: workerId, runDeadlineAt: { gt: new Date() } }
  }) === 1;
}

export async function cleanupExpiredTopicJobs(now = new Date()) {
  await prisma.topicGenerationJob.deleteMany({ where: { expiresAt: { lte: now }, status: { in: ["succeeded", "failed", "canceled"] } } });
}

export async function reconcileTopicJobDeadlines(now = new Date()) {
  await prisma.topicGenerationJob.updateMany({
    where: { status: { in: ["queued", "processing"] }, runDeadlineAt: { lte: now }, quotaChargedAt: null },
    data: { status: "failed", errorCode: "TOPIC_JOB_TIMED_OUT", input: Prisma.DbNull, result: Prisma.DbNull, lockedAt: null, lockedBy: null }
  });
  await cleanupExpiredTopicJobs(now);
}

function isInput(value: Prisma.JsonValue | null): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseStoredResult(value: Prisma.JsonValue | null): TopicGeneration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.ideas) && Array.isArray(candidate.topPicks)
    ? candidate as unknown as TopicGeneration
    : null;
}

function stringValue(value: unknown) { return typeof value === "string" ? value : undefined; }
function stringArray(value: unknown) { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined; }

function topicFailureMessage(errorCode: string | null) {
  if (errorCode === "PROJECT_PROFILE_CHANGED") return "商家资料已更新，请重新分析后再生成";
  if (errorCode === "DAILY_TOPIC_LIMIT_REACHED") return "今日爆款选题额度已用完，请明日再试";
  if (errorCode === "AI_PROVIDER_TIMEOUT" || errorCode === "TOPIC_JOB_TIMED_OUT") return "AI生成时间较长，本次未扣额度，请重新生成";
  if (errorCode === "AI_PROVIDER_NETWORK_ERROR" || errorCode === "AI_PROVIDER_HTTP_ERROR" || errorCode === "AI_PROVIDER_NOT_CONFIGURED") return "AI服务暂时不可用，本次未扣额度，请稍后重试";
  if (errorCode === "AI_PROVIDER_EMPTY_RESPONSE" || errorCode === "AI_PROVIDER_INVALID_JSON" || errorCode === "AI_PROVIDER_INVALID_RESPONSE") return "AI返回内容不完整，本次未扣额度，请重新生成";
  if (errorCode === "AI_PROVIDER_UNSAFE_RESPONSE") return "AI结果未通过安全校验，本次未扣额度，请调整关键词后重试";
  return safeFailureMessage;
}

export function serializeTopicJobOutcome(
  event: string,
  errorCode: string | undefined,
  startedAt: number,
  diagnostic?: TopicFailureDiagnostic,
  job?: { id: string; attemptCount: number; runDeadlineAt: Date }
) {
  return JSON.stringify({
    event,
    ...(errorCode ? { errorCode } : {}),
    ...(diagnostic?.providerSubreason ? { providerSubreason: diagnostic.providerSubreason } : {}),
    ...(diagnostic?.attempts !== undefined ? { attempts: diagnostic.attempts } : {}),
    ...(diagnostic?.semanticAttempts !== undefined ? { semanticAttempts: diagnostic.semanticAttempts } : {}),
    ...(diagnostic?.batchIndex !== undefined ? { batchIndex: diagnostic.batchIndex } : {}),
    ...(diagnostic?.finishReason ? { finishReason: diagnostic.finishReason } : {}),
    ...(diagnostic?.responseLengthBucket ? { responseLengthBucket: diagnostic.responseLengthBucket } : {}),
    ...(diagnostic?.requestPromptLengthBucket ? { requestPromptLengthBucket: diagnostic.requestPromptLengthBucket } : {}),
    ...(diagnostic?.maxTokens !== undefined ? { maxTokens: diagnostic.maxTokens } : {}),
    ...(diagnostic?.responseContentTypeClass ? { responseContentTypeClass: diagnostic.responseContentTypeClass } : {}),
    ...(diagnostic?.responseDeclaredLengthBucket ? { responseDeclaredLengthBucket: diagnostic.responseDeclaredLengthBucket } : {}),
    ...(diagnostic?.responseTransferClass ? { responseTransferClass: diagnostic.responseTransferClass } : {}),
    ...(diagnostic?.transportAttempts ? { transportAttempts: diagnostic.transportAttempts } : {}),
    ...(diagnostic?.batchBudgetMs !== undefined ? { batchBudgetMs: diagnostic.batchBudgetMs } : {}),
    ...(diagnostic?.remainingBudgetBucket ? { remainingBudgetBucket: diagnostic.remainingBudgetBucket } : {}),
    ...(diagnostic?.promptTokensBucket ? { promptTokensBucket: diagnostic.promptTokensBucket } : {}),
    ...(diagnostic?.completionTokensBucket ? { completionTokensBucket: diagnostic.completionTokensBucket } : {}),
    ...(diagnostic?.reasoningCharLengthBucket ? { reasoningCharLengthBucket: diagnostic.reasoningCharLengthBucket } : {}),
    ...(diagnostic?.contentCharLengthBucket ? { contentCharLengthBucket: diagnostic.contentCharLengthBucket } : {}),
    ...(diagnostic?.thinkingMode ? { thinkingMode: diagnostic.thinkingMode } : {}),
    ...(diagnostic?.parseError ? { parseError: diagnostic.parseError } : {}),
    ...(diagnostic?.parserReason ? { parserReason: diagnostic.parserReason } : {}),
    ...(diagnostic?.validationStage ? { validationStage: diagnostic.validationStage } : {}),
    ...(diagnostic?.assemblyRule ? { assemblyRule: diagnostic.assemblyRule } : {}),
    ...(diagnostic?.duplicateScope ? { duplicateScope: diagnostic.duplicateScope } : {}),
    ...(diagnostic?.duplicateCountBucket ? { duplicateCountBucket: diagnostic.duplicateCountBucket } : {}),
    ...(diagnostic?.uniquePreservedCountBucket ? { uniquePreservedCountBucket: diagnostic.uniquePreservedCountBucket } : {}),
    ...(diagnostic?.duplicateRepairStage ? { duplicateRepairStage: diagnostic.duplicateRepairStage } : {}),
    ...(job ? { jobHash: topicJobHash(job.id), attemptCount: job.attemptCount, remainingBudgetBucket: topicRemainingBudgetBucket(job.runDeadlineAt.getTime()) } : {}),
    durationMs: Date.now() - startedAt
  });
}

function logTopicJobOutcome(
  event: string,
  errorCode: string | undefined,
  startedAt: number,
  diagnostic?: TopicFailureDiagnostic,
  job?: { id: string; attemptCount: number; runDeadlineAt: Date }
) {
  process.stdout.write(`${serializeTopicJobOutcome(event, errorCode, startedAt, diagnostic, job)}\n`);
}

function topicJobHash(jobId: string) {
  return createHash("sha256").update(`topic-generation-job:${jobId}`).digest("hex").slice(0, 12);
}

export function normalizeTopicClientRequestId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TopicGenerationJobError("INVALID_CLIENT_REQUEST_ID", "请求标识无效，请重新提交", 400);
  }
  return value.toLowerCase();
}
