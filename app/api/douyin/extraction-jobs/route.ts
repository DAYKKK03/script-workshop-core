import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import {
  createExtractionJob,
  ExtractionJobError
} from "@/lib/douyin/extraction-jobs";
import { consumeRateLimit, getRequestIp, RateLimitError } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse(
      {
        code: "UNAUTHENTICATED",
        message: "请先登录"
      },
      401
    );
  }

  try {
    await Promise.all([
      consumeRateLimit({ scope: "extraction-user", identity: user.id, limit: 20, windowMs: 60 * 60 * 1000 }),
      consumeRateLimit({ scope: "extraction-ip", identity: getRequestIp(request), limit: 60, windowMs: 60 * 60 * 1000 })
    ]);
    const body = await readJsonBody(request);
    const result = await createExtractionJob({
      userId: user.id,
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
      douyinUrl: body.douyinUrl
    });

    return successResponse(result, { status: 202 });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return errorResponse({ code: "RATE_LIMITED", message: "提取请求过于频繁，请稍后再试" }, 429);
    }
    if (error instanceof ExtractionJobError) {
      return errorResponse(
        {
          code: error.code,
          message: error.message
        },
        error.status
      );
    }

    return errorResponse(
      {
        code: "EXTRACTION_JOB_CREATE_FAILED",
        message: "创建提取任务失败，请稍后重试"
      },
      500
    );
  }
}
