import { errorResponse, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import {
  cancelCustomScriptGenerationJobForUser,
  CustomScriptGenerationJobError,
  getCustomScriptGenerationJobForUser
} from "@/lib/custom-scripts/jobs";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse({ code: "UNAUTHENTICATED", message: "请先登录" }, 401);
  try {
    const { jobId } = await context.params;
    return successResponse(await getCustomScriptGenerationJobForUser(jobId, user.id));
  } catch (error) {
    if (error instanceof CustomScriptGenerationJobError) {
      return errorResponse({ code: error.code, message: error.message }, error.status);
    }
    return errorResponse({ code: "CUSTOM_SCRIPT_JOB_READ_FAILED", message: "任务状态读取失败，请稍后重试" }, 500);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse({ code: "UNAUTHENTICATED", message: "请先登录" }, 401);
  try {
    const { jobId } = await context.params;
    return successResponse(await cancelCustomScriptGenerationJobForUser(jobId, user.id));
  } catch (error) {
    if (error instanceof CustomScriptGenerationJobError) {
      return errorResponse({ code: error.code, message: error.message }, error.status);
    }
    return errorResponse({ code: "CUSTOM_SCRIPT_JOB_CANCEL_FAILED", message: "任务取消失败，请稍后重试" }, 500);
  }
}
