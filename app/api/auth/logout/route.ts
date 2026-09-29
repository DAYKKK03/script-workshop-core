import {
  revokeCurrentUserSession,
  sessionCookieName,
  sessionCookieOptions
} from "@/lib/auth/session";
import { successResponse } from "@/lib/auth/api";

export async function POST() {
  await revokeCurrentUserSession();
  const response = successResponse({});

  response.cookies.set(sessionCookieName, "", {
    ...sessionCookieOptions,
    maxAge: 0
  });

  return response;
}
