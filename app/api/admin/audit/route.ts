import { authorizeAdminApi } from "@/lib/admin/api";
import { successResponse } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await authorizeAdminApi(["OWNER"]);
  if ("response" in auth) return auth.response;
  return successResponse(await prisma.adminAuditLog.findMany({
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      admin: { select: { account: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 500
  }));
}
