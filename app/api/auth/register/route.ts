import { createUserSession, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { AuthError, registerUser } from "@/lib/auth/service";
import { consumeRateLimit, getRequestIp, RateLimitError } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const body = await readJsonBody(request);

  try {
    const ip = getRequestIp(request);
    const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "unknown";
    await Promise.all([
      consumeRateLimit({ scope: "register-ip", identity: ip, limit: 5, windowMs: 60 * 60 * 1000 }),
      consumeRateLimit({ scope: "register-invite", identity: inviteCode, limit: 10, windowMs: 60 * 60 * 1000 })
    ]);
    const user = await registerUser({
      account: body.account,
      password: body.password,
      inviteCode: body.inviteCode
    });
    const session = await createUserSession(user.id, request);
    const response = successResponse({ user }, { status: 201 });

    response.cookies.set(
      sessionCookieName,
      session.token,
      sessionCookieOptions
    );

    return response;
  } catch (error) {
    if (error instanceof RateLimitError) {
      return errorResponse(
        { code: "RATE_LIMITED", message: "尝试次数过多，请稍后再试" },
        429
      );
    }
    if (error instanceof AuthError) {
      return errorResponse(
        {
          code: error.code,
          message: error.message
        },
        error.status
      );
    }

    return errorResponse(
      {
        code: "REGISTER_FAILED",
        message: "注册失败，请稍后再试"
      },
      500
    );
  }
}
