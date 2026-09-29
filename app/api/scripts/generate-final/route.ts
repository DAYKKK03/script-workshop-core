import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import { generateFinalScript } from "@/lib/scripts/generate-final-script";
import { consumeRateLimit, RateLimitError } from "@/lib/security/rate-limit";

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
    await consumeRateLimit({ scope: "generate-user", identity: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody(request);
    const result = await generateFinalScript({
      userId: user.id,
      projectId: body.projectId,
      referenceStructure: body.referenceStructure,
      duration: body.duration
    });

    if (result.status !== "success") {
      return errorResponse(
        { code: result.errorCode, message: result.message },
        result.status === "blocked" ? 503 : 400
      );
    }

    return successResponse({ finalScript: result.finalScript });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return errorResponse({ code: "RATE_LIMITED", message: "生成请求过于频繁，请稍后再试" }, 429);
    }
    return errorResponse({ code: "GENERATE_FAILED", message: "生成失败，请稍后再试" }, 500);
  }
}
