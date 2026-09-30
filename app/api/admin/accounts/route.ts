import { authorizeAdminApi } from "@/lib/admin/api";
import { verifyAdminTotp } from "@/lib/admin/auth";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getAccountUsage } from "@/lib/admin/data";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await authorizeAdminApi();
  if ("response" in auth) return auth.response;
  return successResponse(await getAccountUsage());
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdminApi(["OWNER"]);
  if ("response" in auth) return auth.response;
  const body = await readJsonBody(request);
  if (!(await verifyAdminTotp(auth.admin.id, body.totpCode))) {
    return errorResponse({ code: "TOTP_REQUIRED", message: "管理员验证码错误" }, 403);
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const dailyScriptLimit = Number(body.dailyScriptLimit);
  const dailyTopicLimit = Number(body.dailyTopicLimit);
  const status = body.status === "active" || body.status === "disabled" ? body.status : null;
  const revokeSessions = body.revokeSessions === true;
  if (!userId || !Number.isInteger(dailyScriptLimit) || dailyScriptLimit < 0 || dailyScriptLimit > 1000 || !Number.isInteger(dailyTopicLimit) || dailyTopicLimit < 0 || dailyTopicLimit > 1000 || !status) {
    return errorResponse({ code: "INVALID_ACCOUNT_UPDATE", message: "账号配置无效" });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { dailyScriptLimit, dailyTopicLimit, status },
    select: { id: true, account: true, status: true, dailyScriptLimit: true, dailyTopicLimit: true }
  });
  if (status === "disabled" || revokeSessions) await revokeAllUserSessions(userId);
  await recordAdminAudit({
    adminId: auth.admin.id,
    action: "user.configuration.update",
    targetType: "user",
    targetId: userId,
    metadata: { status, dailyScriptLimit, dailyTopicLimit, revokeSessions },
    request
  });
  return successResponse(updated);
}
