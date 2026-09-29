import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isUserPasswordAllowed } from "@/lib/auth/password-policy";

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

function normalizeAccount(account: unknown) {
  return typeof account === "string" ? account.trim() : "";
}

function normalizePassword(password: unknown) {
  return typeof password === "string" ? password : "";
}

function normalizeInviteCode(inviteCode: unknown) {
  return typeof inviteCode === "string" ? inviteCode.trim() : "";
}

function validateAccount(account: string) {
  if (!account) {
    throw new AuthError("ACCOUNT_REQUIRED", "请输入账号");
  }
}

function validatePassword(password: string) {
  if (!isUserPasswordAllowed(password)) {
    throw new AuthError("PASSWORD_INVALID", "密码需要 10-128 位");
  }
}

function serializeUser(user: { id: string; account: string }) {
  return {
    id: user.id,
    account: user.account
  };
}

export async function registerUser(input: {
  account: unknown;
  password: unknown;
  inviteCode: unknown;
}) {
  const account = normalizeAccount(input.account);
  const password = normalizePassword(input.password);
  const inviteCode = normalizeInviteCode(input.inviteCode);

  validateAccount(account);
  validatePassword(password);

  if (!inviteCode) {
    throw new AuthError("INVITE_CODE_REQUIRED", "请输入邀请码");
  }

  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const invite = await tx.inviteCode.findUnique({
      where: { code: inviteCode }
    });

    if (!invite) {
      throw new AuthError("INVITE_CODE_INVALID", "邀请码无效");
    }

    if (invite.status === "used") {
      throw new AuthError("INVITE_CODE_USED", "邀请码已使用");
    }

    if (invite.status === "disabled") {
      throw new AuthError("INVITE_CODE_DISABLED", "邀请码已禁用");
    }

    const existingUser = await tx.user.findUnique({
      where: { account },
      select: { id: true }
    });

    if (existingUser) {
      throw new AuthError("ACCOUNT_ALREADY_EXISTS", "账号已存在");
    }

    const user = await tx.user.create({
      data: {
        account,
        passwordHash,
        inviteCodeUsed: inviteCode
      },
      select: {
        id: true,
        account: true
      }
    });

    const updateResult = await tx.inviteCode.updateMany({
      where: {
        code: inviteCode,
        status: "unused"
      },
      data: {
        status: "used",
        usedByUserId: user.id,
        usedAt: new Date()
      }
    });

    if (updateResult.count !== 1) {
      throw new AuthError("INVITE_CODE_USED", "邀请码已使用");
    }

    return serializeUser(user);
  });
}

export async function loginUser(input: { account: unknown; password: unknown }) {
  const account = normalizeAccount(input.account);
  const password = normalizePassword(input.password);

  validateAccount(account);

  if (!password) {
    throw new AuthError("ACCOUNT_OR_PASSWORD_INVALID", "账号或密码错误", 401);
  }

  const user = await prisma.user.findUnique({
    where: { account },
    select: {
      id: true,
      account: true,
      passwordHash: true,
      status: true
    }
  });

  if (!user) {
    throw new AuthError("ACCOUNT_OR_PASSWORD_INVALID", "账号或密码错误", 401);
  }

  if (user.status !== "active") {
    throw new AuthError("ACCOUNT_DISABLED", "账号已停用", 403);
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AuthError("ACCOUNT_OR_PASSWORD_INVALID", "账号或密码错误", 401);
  }

  return serializeUser(user);
}
