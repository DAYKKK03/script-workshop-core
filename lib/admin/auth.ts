import { Secret, TOTP } from "otpauth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { decryptTotpSecret, hashRecoveryCode } from "@/lib/admin/security";

export class AdminAuthError extends Error {
  constructor(
    public code: string,
    public status = 401,
    message = "管理员账号、密码或验证码错误"
  ) {
    super(message);
  }
}

export async function authenticateAdmin({
  account,
  password,
  verificationCode
}: {
  account: unknown;
  password: unknown;
  verificationCode: unknown;
}) {
  if (
    typeof account !== "string" ||
    typeof password !== "string" ||
    typeof verificationCode !== "string"
  ) {
    throw new AdminAuthError("INVALID_ADMIN_CREDENTIALS");
  }

  const admin = await prisma.adminUser.findUnique({
    where: { account: account.trim() },
    include: { recoveryCodes: { where: { usedAt: null } } }
  });
  const passwordValid = admin
    ? await verifyPassword(password, admin.passwordHash)
    : false;

  if (!admin || !passwordValid || admin.status !== "active") {
    throw new AdminAuthError("INVALID_ADMIN_CREDENTIALS");
  }

  const secret = decryptTotpSecret(admin.totpSecretEncrypted);
  const totpValid = verifyTotpCode(secret, verificationCode);
  const recoveryHash = hashRecoveryCode(verificationCode);
  const recoveryCode = admin.recoveryCodes.find(
    (candidate) => candidate.codeHash === recoveryHash
  );

  if (!totpValid && !recoveryCode) {
    throw new AdminAuthError("INVALID_ADMIN_CREDENTIALS");
  }

  await prisma.$transaction(async (tx) => {
    if (recoveryCode) {
      const used = await tx.adminRecoveryCode.updateMany({
        where: { id: recoveryCode.id, usedAt: null },
        data: { usedAt: new Date() }
      });
      if (used.count !== 1) throw new AdminAuthError("RECOVERY_CODE_ALREADY_USED");
    }
    await tx.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { id: admin.id, account: admin.account, role: admin.role };
}

export async function verifyAdminTotp(adminId: string, code: unknown) {
  if (typeof code !== "string") return false;
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { totpSecretEncrypted: true, status: true }
  });
  return Boolean(
    admin?.status === "active" &&
      verifyTotpCode(decryptTotpSecret(admin.totpSecretEncrypted), code)
  );
}

function verifyTotpCode(secret: string, code: string) {
  if (!/^\d{6}$/.test(code.trim())) return false;
  return TOTP.validate({
    token: code.trim(),
    secret: Secret.fromBase32(secret),
    window: 1
  }) !== null;
}
