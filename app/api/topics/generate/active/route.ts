import { errorResponse, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveTopicGenerationJobForUser } from "@/lib/topics/jobs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse({ code: "UNAUTHENTICATED", message: "请先登录" }, 401);
  try {
    return successResponse(await getActiveTopicGenerationJobForUser(user.id));
  } catch {
    return errorResponse({ code: "TOPIC_JOB_READ_FAILED", message: "任务状态读取失败，请稍后重试" }, 500);
  }
}
