import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { createTopicGenerationJob, TopicGenerationJobError } from "@/lib/topics/jobs";
import { DailyTopicLimitError } from "@/lib/usage/service";
import { createHash } from "node:crypto";

const requestDeadlineMs = 10_000;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  const deadline = startedAt + requestDeadlineMs;
  let clientRequestIdHash: string | undefined;
  let jobCreated = false;
  try {
    const authStarted = Date.now();
    const user = await withStageDeadline("auth", getCurrentUser(), deadline);
    timings.authMs = Date.now() - authStarted;
    if (!user) return loggedError("auth", 401, startedAt, timings, clientRequestIdHash, jobCreated, { code: "UNAUTHENTICATED", message: "请先登录" });
    const rateStarted = Date.now();
    await withStageDeadline("rate_limit", consumeRateLimit({ scope: "topics-generate-user", identity: user.id, limit: 10, windowMs: 60 * 60 * 1000 }), deadline);
    timings.rateLimitMs = Date.now() - rateStarted;
    const bodyStarted = Date.now();
    const body = await withStageDeadline("body", readJsonBody(request), deadline);
    timings.bodyMs = Date.now() - bodyStarted;
    if (typeof body.clientRequestId === "string") clientRequestIdHash = hashRequestId(body.clientRequestId);
    const createStarted = Date.now();
    const job = await withStageDeadline("create", createTopicGenerationJob({ userId: user.id, body }), deadline);
    timings.createMs = Date.now() - createStarted;
    jobCreated = true;
    logTopicCreate({ stageOutcome: "succeeded", responseStatus: 202, startedAt, timings, clientRequestIdHash, jobCreated });
    return successResponse(job);
  } catch (error) {
    if (error instanceof RateLimitError) return loggedError("rate_limit", 429, startedAt, timings, clientRequestIdHash, jobCreated, { code: "RATE_LIMITED", message: "生成请求过于频繁，请稍后再试" });
    if (error instanceof DailyTopicLimitError) return loggedError("rate_limit", 429, startedAt, timings, clientRequestIdHash, jobCreated, { code: "DAILY_TOPIC_LIMIT_REACHED", message: `今日爆款选题额度已用完（${error.limit}次），请明日再试` });
    if (error instanceof TopicGenerationJobError) return loggedError(stageFromError(error), error.status, startedAt, timings, clientRequestIdHash, jobCreated, { code: error.code, message: error.message });
    return loggedError("unknown", 500, startedAt, timings, clientRequestIdHash, jobCreated, { code: "TOPIC_GENERATE_FAILED", message: "选题生成失败，请稍后再试" });
  }
}

async function withStageDeadline<T>(stage: string, task: Promise<T>, deadline: number): Promise<T> {
  const timeoutMs = Math.max(1, deadline - Date.now());
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new TopicGenerationJobError(stage === "create" ? "TOPIC_JOB_CREATE_TIMEOUT" : "TOPIC_REQUEST_TIMEOUT", "请求处理超时，请使用原请求重试", 503)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function hashRequestId(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 12); }
function stageFromError(error: TopicGenerationJobError) { return error.code.includes("CREATE") ? "create" : error.code.includes("RATE") || error.code.includes("LIMIT") ? "rate_limit" : error.code.includes("REQUEST") ? "request" : "unknown"; }
function logTopicCreate(input: { stageOutcome: string; responseStatus: number; startedAt: number; timings: Record<string, number>; clientRequestIdHash?: string; jobCreated: boolean }) { process.stdout.write(`${JSON.stringify({ event: "topic_create_timing", ...input, totalMs: Date.now() - input.startedAt })}\n`); }
function loggedError(stage: string, status: number, startedAt: number, timings: Record<string, number>, clientRequestIdHash: string | undefined, jobCreated: boolean, body: { code: string; message: string }) { logTopicCreate({ stageOutcome: stage, responseStatus: status, startedAt, timings, clientRequestIdHash, jobCreated }); return errorResponse(body, status); }
