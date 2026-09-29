import { errorResponse, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse(
      {
        code: "UNAUTHENTICATED",
        message: "请先登录"
      },
      401
    );
  }

  return successResponse({ user });
}
