import { errorResponse, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import {
  ExtractionJobError,
  getExtractionJobForUser
} from "@/lib/douyin/extraction-jobs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
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

  try {
    const { jobId } = await params;
    const result = await getExtractionJobForUser(jobId, user.id);

    return successResponse(result);
  } catch (error) {
    if (error instanceof ExtractionJobError) {
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
        code: "EXTRACTION_JOB_QUERY_FAILED",
        message: "查询提取任务失败，请稍后重试"
      },
      500
    );
  }
}
