import { authorizeAdminApi } from "@/lib/admin/api";
import { verifyAdminTotp } from "@/lib/admin/auth";
import { recordAdminAudit } from "@/lib/admin/audit";
import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { getConfiguredProviderPrices } from "@/lib/usage/service";

export async function GET() { const auth = await authorizeAdminApi(["OWNER"]); if ("response" in auth) return auth.response; return successResponse(await getConfiguredProviderPrices()); }

export async function PATCH(request: Request) {
  const auth = await authorizeAdminApi(["OWNER"]); if ("response" in auth) return auth.response;
  const body = await readJsonBody(request);
  if (!(await verifyAdminTotp(auth.admin.id, body.totpCode))) return errorResponse({ code: "TOTP_REQUIRED", message: "管理员验证码错误" }, 403);
  const values = {
    deepseekInputCnyPerMillion: Number(body.deepseekInputCnyPerMillion),
    deepseekOutputCnyPerMillion: Number(body.deepseekOutputCnyPerMillion),
    asrCnyPerHour: Number(body.asrCnyPerHour),
    tikhubCnyPerRequest: Number(body.tikhubCnyPerRequest)
  };
  if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0 || value > 1_000_000)) return errorResponse({ code: "INVALID_COST_CONFIGURATION", message: "成本单价无效" });
  const configured = await prisma.costConfiguration.upsert({ where: { id: "default" }, create: { id: "default", ...values, updatedById: auth.admin.id }, update: { ...values, updatedById: auth.admin.id } });
  await recordAdminAudit({ adminId: auth.admin.id, action: "cost.configuration.update", targetType: "cost_configuration", targetId: configured.id, request });
  return successResponse(values);
}
