import type { AdminRole } from "@prisma/client";
import { errorResponse } from "@/lib/auth/api";
import { getCurrentAdmin } from "@/lib/admin/session";

export async function authorizeAdminApi(roles?: AdminRole[]) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return { response: errorResponse({ code: "ADMIN_UNAUTHORIZED", message: "请重新登录后台" }, 401) };
  }
  if (roles && !roles.includes(admin.role)) {
    return { response: errorResponse({ code: "ADMIN_FORBIDDEN", message: "无权执行此操作" }, 403) };
  }
  return { admin };
}
