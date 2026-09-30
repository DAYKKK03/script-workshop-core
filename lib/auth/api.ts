import { NextResponse } from "next/server";
import { withNoStoreHeaders } from "@/lib/auth/response-policy";

type ApiError = {
  code: string;
  message: string;
};

export function successResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, withNoStoreHeaders(init));
}

export function errorResponse(error: ApiError, status = 400) {
  return NextResponse.json(
    { success: false, error },
    withNoStoreHeaders({ status })
  );
}

export async function readJsonBody(request: Request) {
  try {
    const maximumBytes = 64 * 1024;
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > maximumBytes) return {};

    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maximumBytes) return {};
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}
