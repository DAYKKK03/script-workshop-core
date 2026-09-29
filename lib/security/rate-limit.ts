import { prisma } from "@/lib/prisma";
import {
  buildRateLimitKey,
  getRateLimitWindow
} from "@/lib/security/rate-limit-policy";

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("RATE_LIMITED");
  }
}

export async function consumeRateLimit({
  scope,
  identity,
  limit,
  windowMs,
  now = new Date()
}: {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
  now?: Date;
}) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("RATE_LIMIT_SECRET is not configured");

  const window = getRateLimitWindow({ now, windowMs });
  const keyHash = buildRateLimitKey({
    scope,
    identity: `${identity}:${window.startedAt.toISOString()}`,
    secret
  });

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { keyHash },
    create: {
      keyHash,
      scope,
      windowStartedAt: window.startedAt,
      expiresAt: window.expiresAt,
      count: 1
    },
    update: { count: { increment: 1 } },
    select: { count: true }
  });

  if (bucket.count > limit) {
    throw new RateLimitError(
      Math.max(1, Math.ceil((window.expiresAt.getTime() - now.getTime()) / 1000))
    );
  }
}

export function getRequestIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
