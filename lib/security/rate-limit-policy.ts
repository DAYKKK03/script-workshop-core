import { createHmac } from "crypto";

export function buildRateLimitKey({
  scope,
  identity,
  secret
}: {
  scope: string;
  identity: string;
  secret: string;
}) {
  return createHmac("sha256", secret)
    .update(`${scope}:${identity.trim().toLowerCase()}`)
    .digest("hex");
}

export function getRateLimitWindow({
  now = new Date(),
  windowMs
}: {
  now?: Date;
  windowMs: number;
}) {
  const startedAt = new Date(
    Math.floor(now.getTime() / windowMs) * windowMs
  );

  return {
    startedAt,
    expiresAt: new Date(startedAt.getTime() + windowMs)
  };
}
