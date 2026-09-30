import { randomBytes } from "crypto";
import { authorizeAdminApi } from "@/lib/admin/api";
import { recordAdminAudit } from "@/lib/admin/audit";
import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await authorizeAdminApi();
  if ("response" in auth) return auth.response;
  const [groups, codes] = await Promise.all([
    prisma.inviteCode.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.inviteCode.findMany({
      select: { code: true, status: true, usedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200
    })
  ]);
  return successResponse({
    counts: Object.fromEntries(groups.map((row) => [row.status, row._count._all])),
    codes: codes.map((invite) => ({ ...invite, code: maskInviteCode(invite.code) }))
  });
}

export async function POST(request: Request) {
  const auth = await authorizeAdminApi(["OWNER", "OPERATOR"]);
  if ("response" in auth) return auth.response;
  const body = await readJsonBody(request);
  const count = Number(body.count || 1);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return errorResponse({ code: "INVALID_INVITE_COUNT", message: "单次可生成 1-100 个邀请码" });
  }
  const codes = Array.from({ length: count }, generateInviteCode);
  await prisma.inviteCode.createMany({
    data: codes.map((code) => ({ code, createdById: auth.admin.id }))
  });
  await recordAdminAudit({
    adminId: auth.admin.id,
    action: "invite.create",
    targetType: "invite",
    metadata: { count },
    request
  });
  return successResponse({ codes }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdminApi(["OWNER", "OPERATOR"]);
  if ("response" in auth) return auth.response;
  const body = await readJsonBody(request);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return errorResponse({ code: "INVITE_REQUIRED", message: "请输入完整邀请码" });
  const result = await prisma.inviteCode.updateMany({
    where: { code, status: "unused" },
    data: { status: "disabled" }
  });
  if (result.count !== 1) {
    return errorResponse({ code: "INVITE_NOT_AVAILABLE", message: "邀请码不存在或已不可用" }, 404);
  }
  await recordAdminAudit({
    adminId: auth.admin.id,
    action: "invite.disable",
    targetType: "invite",
    targetId: maskInviteCode(code),
    request
  });
  return successResponse({ disabled: true });
}

function generateInviteCode() {
  return `SVS-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function maskInviteCode(code: string) {
  return code.length > 8 ? `${code.slice(0, 4)}****${code.slice(-4)}` : "****";
}
