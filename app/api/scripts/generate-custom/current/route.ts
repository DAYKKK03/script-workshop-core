import { errorResponse, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentCustomScriptGenerationJobForUser } from "@/lib/custom-scripts/jobs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse({ code: "UNAUTHENTICATED", message: "请先登录" }, 401);
  try {
    return successResponse(await getCurrentCustomScriptGenerationJobForUser(user.id));
  } catch {
    return errorResponse({ code: "CUSTOM_SCRIPT_JOB_READ_FAILED", message: "任务状态读取失败，请稍后重试" }, 500);
  }
}
