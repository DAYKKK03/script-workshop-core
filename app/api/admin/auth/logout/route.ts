import {
  getCurrentAdmin,
  revokeCurrentAdminSession,
  adminSessionCookieName,
  adminSessionCookieOptions
} from "@/lib/admin/session";
import { recordAdminAudit } from "@/lib/admin/audit";
import { successResponse } from "@/lib/auth/api";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  await revokeCurrentAdminSession();
  if (admin) await recordAdminAudit({ adminId: admin.id, action: "admin.logout", request });
  const response = successResponse({});
  response.cookies.set(adminSessionCookieName, "", {
    ...adminSessionCookieOptions,
    expires: new Date(0),
    maxAge: 0
  });
  return response;
}
