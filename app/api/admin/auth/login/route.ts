import { authenticateAdmin, AdminAuthError } from "@/lib/admin/auth";
import {
  adminSessionCookieName,
  adminSessionCookieOptions,
  createAdminSession
} from "@/lib/admin/session";
import { recordAdminAudit } from "@/lib/admin/audit";
import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { consumeRateLimit, getRequestIp, RateLimitError } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  try {
    const account = typeof body.account === "string" ? body.account.trim() : "unknown";
    await Promise.all([
      consumeRateLimit({ scope: "admin-login-ip", identity: getRequestIp(request), limit: 5, windowMs: 15 * 60 * 1000 }),
      consumeRateLimit({ scope: "admin-login-account", identity: account, limit: 8, windowMs: 60 * 60 * 1000 })
    ]);
    const admin = await authenticateAdmin({
      account: body.account,
      password: body.password,
      verificationCode: body.verificationCode
    });
    const session = await createAdminSession(admin.id, request);
    await recordAdminAudit({ adminId: admin.id, action: "admin.login", request });
    const response = successResponse({ account: admin.account, role: admin.role });
    response.cookies.set(adminSessionCookieName, session.token, adminSessionCookieOptions);
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) {
      return errorResponse({ code: "RATE_LIMITED", message: "尝试次数过多，请稍后再试" }, 429);
    }
    if (error instanceof AdminAuthError) {
      return errorResponse({ code: error.code, message: error.message }, error.status);
    }
    return errorResponse({ code: "ADMIN_LOGIN_FAILED", message: "后台登录失败，请稍后再试" }, 500);
  }
}
