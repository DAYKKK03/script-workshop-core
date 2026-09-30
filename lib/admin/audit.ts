import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

export async function recordAdminAudit({
  adminId,
  action,
  targetType,
  targetId,
  metadata,
  request
}: {
  adminId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  request?: Request;
}) {
  const rawIp =
    request?.headers.get("cf-connecting-ip") ||
    request?.headers.get("x-real-ip") ||
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";

  await prisma.adminAuditLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      metadata,
      ipHash: hashIp(rawIp)
    }
  });
}

function hashIp(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!value || !secret) return null;
  return createHmac("sha256", secret).update(value).digest("hex");
}
