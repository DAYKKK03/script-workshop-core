import { prisma } from "@/lib/prisma";

export async function enforceRetention(now = new Date()) {
  const usageBefore = new Date(now);
  usageBefore.setUTCMonth(usageBefore.getUTCMonth() - 24);
  const auditBefore = new Date(now);
  auditBefore.setUTCMonth(auditBefore.getUTCMonth() - 12);

  await prisma.$transaction([
    prisma.dailyUsage.deleteMany({ where: { usageDate: { lt: usageBefore } } }),
    prisma.adminAuditLog.deleteMany({ where: { createdAt: { lt: auditBefore } } }),
    prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.extractionJob.deleteMany({ where: { expiresAt: { lt: now } } })
  ]);

}
