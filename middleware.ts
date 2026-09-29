import { NextRequest, NextResponse } from "next/server";
import { isTrustedWriteOrigin } from "@/lib/security/csrf";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    mutationMethods.has(request.method)
  ) {
    const origin = request.headers.get("origin");
    const trusted = isTrustedWriteOrigin({
      origin,
      requestUrl: request.url,
      // APP_ORIGIN is runtime server configuration; NEXT_PUBLIC_APP_URL remains
      // a compatibility fallback for existing deployments.
      configuredAppUrl:
        process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL
    });

    if (!trusted && (origin || process.env.NODE_ENV === "production")) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ORIGIN", message: "请求来源不合法" } },
        { status: 403 }
      );
    }
  }

  const response = NextResponse.next();
  const production = process.env.NODE_ENV === "production";
  const scriptPolicy = production ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";

  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (production) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
