import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { analyzeTopicProject } from "@/lib/topics/service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse({ code: "UNAUTHENTICATED", message: "请先登录" }, 401);
  try {
    await consumeRateLimit({ scope: "topics-analyze-user", identity: user.id, limit: 20, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody(request);
    const result = await analyzeTopicProject({ userId: user.id, projectId: body.projectId });
    if (result.status !== "success") return errorResponse({ code: result.errorCode, message: result.message }, result.status === "blocked" ? 503 : result.errorCode === "PROJECT_NOT_FOUND" ? 404 : 400);
    return successResponse(result.analysis);
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse({ code: "RATE_LIMITED", message: "分析请求过于频繁，请稍后再试" }, 429);
    return errorResponse({ code: "TOPIC_ANALYZE_FAILED", message: "商家资料分析失败，请稍后重试" }, 500);
  }
}
