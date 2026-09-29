import { authorizeAdminApi } from "@/lib/admin/api";
import { getAdminOverview } from "@/lib/admin/data";
import { successResponse } from "@/lib/auth/api";

export async function GET(request: Request) {
  const auth = await authorizeAdminApi();
  if ("response" in auth) return auth.response;
  const daysValue = Number(new URL(request.url).searchParams.get("days") || 30);
  const days = [7, 30, 90].includes(daysValue) ? daysValue : 30;
  return successResponse(await getAdminOverview(days));
}
