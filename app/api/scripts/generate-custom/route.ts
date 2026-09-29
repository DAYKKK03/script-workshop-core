import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import {
  createCustomScriptGenerationJob,
  CustomScriptGenerationJobError,
  hashCustomScriptIdentifier
} from "@/lib/custom-scripts/jobs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let requestHash12: string | undefined;
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse({ code: "UNAUTHENTICATED", message: "请先登录" }, 401);
    const body = await readJsonBody(request);
    if (typeof body.clientRequestId === "string") requestHash12 = hashCustomScriptIdentifier(body.clientRequestId);
    const job = await createCustomScriptGenerationJob({ userId: user.id, body });
    logCreate("succeeded", 202, startedAt, requestHash12);
    return successResponse(job, { status: 202 });
  } catch (error) {
    if (error instanceof CustomScriptGenerationJobError) {
      logCreate(error.code, error.status, startedAt, requestHash12);
      return errorResponse({ code: error.code, message: error.message }, error.status);
    }
    logCreate("CUSTOM_SCRIPT_CREATE_FAILED", 500, startedAt, requestHash12);
    return errorResponse({ code: "CUSTOM_SCRIPT_CREATE_FAILED", message: "任务创建失败，请使用原请求重试" }, 500);
  }
}

function logCreate(outcome: string, responseStatus: number, startedAt: number, requestHash12?: string) {
  process.stdout.write(`${JSON.stringify({
    event: "custom_script_create",
    outcome,
    responseStatus,
    ...(requestHash12 ? { requestHash12 } : {}),
    durationMs: Date.now() - startedAt
  })}\n`);
}
