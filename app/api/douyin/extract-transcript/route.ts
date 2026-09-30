import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import {
  douyinTranscriptFailureMessage,
  douyinTranscriptProvider
} from "@/lib/douyin/transcript-provider";
import { resolveExtractionCompletion } from "@/lib/douyin/extraction-job-contract";

export async function POST(request: Request) {
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

  const body = await readJsonBody(request);
  const douyinUrl = typeof body.douyinUrl === "string" ? body.douyinUrl : "";
  const result = await douyinTranscriptProvider(douyinUrl, user.id);

  if (result.status !== "success") {
    const isInvalidDouyinUrl = result.errorCode === "INVALID_DOUYIN_URL";

    return errorResponse(
      {
        code: isInvalidDouyinUrl
          ? "INVALID_DOUYIN_URL"
          : "DOUYIN_TRANSCRIPT_UNAVAILABLE",
        message: douyinTranscriptFailureMessage
      },
      isInvalidDouyinUrl ? 400 : 503
    );
  }

  const completion = resolveExtractionCompletion(result.originalTranscript);

  if (completion.status === "failed") {
    return errorResponse(
      {
        code: "DOUYIN_TRANSCRIPT_UNAVAILABLE",
        message: douyinTranscriptFailureMessage
      },
      503
    );
  }

  return successResponse({
    originalTranscript: completion.originalTranscript
  });
}
