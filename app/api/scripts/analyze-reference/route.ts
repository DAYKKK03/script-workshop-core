import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import { analyzeReferenceScript } from "@/lib/scripts/analyze-reference-script";
import { logAnalyzeReferenceFailure } from "@/lib/scripts/analyze-reference-diagnostics";
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

  let originalTranscript = "";

  try {
    await consumeRateLimit({ scope: "analyze-user", identity: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody(request);
    originalTranscript =
      typeof body.originalTranscript === "string" ? body.originalTranscript : "";
    if (originalTranscript.length > 20_000) {
      return errorResponse(
        { code: "TRANSCRIPT_TOO_LONG", message: "口播内容超出处理长度限制" },
        413
      );
    }
    const result = await analyzeReferenceScript(originalTranscript, user.id);

    if (result.status !== "success") {
      return errorResponse(
        { code: result.errorCode, message: result.message },
        result.status === "blocked" ? 503 : 400
      );
    }

    return successResponse({ sections: result.sections, referenceStructure: result.referenceStructure });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return errorResponse({ code: "RATE_LIMITED", message: "拆解请求过于频繁，请稍后再试" }, 429);
    }
    logAnalyzeReferenceFailure({
      errorCode: "ANALYZE_FAILED",
      transcript: originalTranscript,
      userId: user.id
    });
    return errorResponse({ code: "ANALYZE_FAILED", message: "拆解失败，请稍后再试" }, 500);
  }
}
