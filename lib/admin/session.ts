import { createHmac } from "crypto";
import type { AdminRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createOpaqueSessionToken,
  hashSessionToken
} from "@/lib/auth/session-token";
import { shouldUseSecureSessionCookies } from "@/lib/auth/session-cookie-policy";

export const adminSessionCookieName = "svs_admin_session";
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const touchIntervalMs = 15 * 60 * 1000;

export type CurrentAdmin = {
  id: string;
  account: string;
  role: AdminRole;
  mfaVerifiedAt: Date;
};

export async function createAdminSession(adminId: string, request?: Request) {
  const token = createOpaqueSessionToken();
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  const mfaVerifiedAt = new Date();

  await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash: hashSessionToken(token),
      ipHash: hashMetadata(getClientIp(request)),
      userAgentHash: hashMetadata(request?.headers.get("user-agent") || ""),
      mfaVerifiedAt,
      expiresAt
    }
  });

  return { token, expiresAt };
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const token = (await cookies()).get(adminSessionCookieName)?.value;
  if (!token) return null;

  const now = new Date();
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      lastSeenAt: true,
      expiresAt: true,
      revokedAt: true,
      mfaVerifiedAt: true,
      admin: {
        select: { id: true, account: true, role: true, status: true }
      }
    }
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.admin.status !== "active"
  ) {
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= touchIntervalMs) {
    void prisma.adminSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastSeenAt: now }
    });
  }

  return {
    id: session.admin.id,
    account: session.admin.account,
    role: session.admin.role,
    mfaVerifiedAt: session.mfaVerifiedAt
  };
}

export async function requireAdmin(roles?: AdminRole[]) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (roles && !roles.includes(admin.role)) redirect("/admin");
  return admin;
}

export async function revokeCurrentAdminSession() {
  const token = (await cookies()).get(adminSessionCookieName)?.value;
  if (!token) return;
  await prisma.adminSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function revokeAllAdminSessions(adminId: string) {
  await prisma.adminSession.updateMany({
    where: { adminId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

function getSessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET is not configured");
  return value;
}

function hashMetadata(value: string) {
  if (!value) return null;
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function getClientIp(request?: Request) {
  if (!request) return "";
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

export const adminSessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: shouldUseSecureSessionCookies(),
  path: "/",
  maxAge: sessionLifetimeMs / 1000
};
