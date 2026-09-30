import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createOpaqueSessionToken,
  hashSessionToken
} from "@/lib/auth/session-token";
import { shouldUseSecureSessionCookies } from "@/lib/auth/session-cookie-policy";

export const sessionCookieName = "svs_session";

export type AuthUser = {
  id: string;
  account: string;
};

const userSessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const sessionTouchIntervalMs = 15 * 60 * 1000;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  }

  return secret;
}

export async function createUserSession(userId: string, request?: Request) {
  const token = createOpaqueSessionToken();
  const expiresAt = new Date(Date.now() + userSessionLifetimeMs);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      ipHash: hashMetadata(getClientIp(request)),
      userAgentHash: hashMetadata(request?.headers.get("user-agent") || ""),
      expiresAt
    }
  });

  return { token, expiresAt };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) return null;

  const now = new Date();
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      lastSeenAt: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: { id: true, account: true, status: true }
      }
    }
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.user.status !== "active"
  ) {
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= sessionTouchIntervalMs) {
    void prisma.userSession
      .updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastSeenAt: now }
      })
      .catch(() => undefined);
  }

  return { id: session.user.id, account: session.user.account };
}

export async function revokeCurrentUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) return;

  await prisma.userSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  return user;
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

function hashMetadata(value: string) {
  if (!value) return null;
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: shouldUseSecureSessionCookies(),
  path: "/",
  maxAge: userSessionLifetimeMs / 1000
};
