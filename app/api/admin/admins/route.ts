import { Secret, TOTP } from "otpauth";
import { authorizeAdminApi } from "@/lib/admin/api";
import { recordAdminAudit } from "@/lib/admin/audit";
import { verifyAdminTotp } from "@/lib/admin/auth";
import { encryptTotpSecret, generateRecoveryCodes, hashRecoveryCode } from "@/lib/admin/security";
import { revokeAllAdminSessions } from "@/lib/admin/session";
import { hashPassword } from "@/lib/auth/password";
import { isAdminPasswordAllowed } from "@/lib/auth/password-policy";
import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await authorizeAdminApi(["OWNER"]);
  if ("response" in auth) return auth.response;
  return successResponse(await prisma.adminUser.findMany({
    select: { id: true, account: true, role: true, status: true, createdAt: true, lastLoginAt: true },
    orderBy: { createdAt: "desc" }
  }));
}

export async function POST(request: Request) {
  const auth = await authorizeAdminApi(["OWNER"]);
  if ("response" in auth) return auth.response;
  const body = await readJsonBody(request);
  if (!(await verifyAdminTotp(auth.admin.id, body.totpCode))) {
    return errorResponse({ code: "TOTP_REQUIRED", message: "管理员验证码错误" }, 403);
  }
  const account = typeof body.account === "string" ? body.account.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "OWNER" || body.role === "OPERATOR" ? body.role : null;
  if (!account || account.length > 64 || !isAdminPasswordAllowed(password) || !role) {
    return errorResponse({ code: "INVALID_ADMIN", message: "账号、权限或密码不符合要求" });
  }

  const secret = new Secret({ size: 20 }).base32;
  const recoveryCodes = generateRecoveryCodes();
  const admin = await prisma.adminUser.create({
    data: {
      account,
      passwordHash: await hashPassword(password),
      role,
      totpSecretEncrypted: encryptTotpSecret(secret),
      recoveryCodes: { create: recoveryCodes.map((code) => ({ codeHash: hashRecoveryCode(code) })) }
    },
    select: { id: true, account: true, role: true }
  });
  await recordAdminAudit({
    adminId: auth.admin.id,
    action: "admin.create",
    targetType: "admin",
    targetId: admin.id,
    metadata: { role },
    request
  });
  const totp = new TOTP({ issuer: "短视频脚本后台", label: account, secret });
  return successResponse({ admin, provisioningUri: totp.toString(), recoveryCodes }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdminApi(["OWNER"]);
  if ("response" in auth) return auth.response;
  const body = await readJsonBody(request);
  if (!(await verifyAdminTotp(auth.admin.id, body.totpCode))) {
    return errorResponse({ code: "TOTP_REQUIRED", message: "管理员验证码错误" }, 403);
  }
  const adminId = typeof body.adminId === "string" ? body.adminId : "";
  const role = body.role === "OWNER" || body.role === "OPERATOR" ? body.role : null;
  const status = body.status === "active" || body.status === "disabled" ? body.status : null;
  if (!adminId || !role || !status || adminId === auth.admin.id) {
    return errorResponse({ code: "INVALID_ADMIN_UPDATE", message: "不能修改当前登录账号或配置无效" });
  }
  if (status === "disabled" || role !== "OWNER") {
    const activeOwnerCount = await prisma.adminUser.count({
      where: { role: "OWNER", status: "active", id: { not: adminId } }
    });
    if (activeOwnerCount < 1) {
      return errorResponse({ code: "LAST_OWNER_REQUIRED", message: "至少保留一个可用 OWNER" });
    }
  }
  const admin = await prisma.adminUser.update({
    where: { id: adminId },
    data: { role, status },
    select: { id: true, account: true, role: true, status: true }
  });
  await revokeAllAdminSessions(adminId);
  await recordAdminAudit({
    adminId: auth.admin.id,
    action: "admin.update",
    targetType: "admin",
    targetId: adminId,
    metadata: { role, status },
    request
  });
  return successResponse(admin);
}
