import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import { createProject, listProjects, ProjectError } from "@/lib/projects/service";

async function requireApiUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new ProjectError("UNAUTHENTICATED", "请先登录", 401);
  }

  return user;
}

function handleProjectError(error: unknown) {
  if (error instanceof ProjectError) {
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
      code: "PROJECT_REQUEST_FAILED",
      message: "项目请求失败，请稍后再试"
    },
    500
  );
}

export async function GET() {
  try {
    const user = await requireApiUser();
    const projects = await listProjects(user.id);

    return successResponse({ projects });
  } catch (error) {
    return handleProjectError(error);
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);

  try {
    const user = await requireApiUser();
    const project = await createProject(user.id, {
      projectName: body.projectName,
      profileText: body.profileText
    });

    return successResponse({ project }, { status: 201 });
  } catch (error) {
    return handleProjectError(error);
  }
}
