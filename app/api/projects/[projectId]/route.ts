import { errorResponse, readJsonBody, successResponse } from "@/lib/auth/api";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getProjectForUser,
  ProjectError,
  updateProject
} from "@/lib/projects/service";
import { deleteProject } from "@/lib/projects/delete-service";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    const project = await getProjectForUser(projectId, user.id);

    if (!project) {
      throw new ProjectError("PROJECT_NOT_FOUND", "项目不存在", 404);
    }

    return successResponse({ project });
  } catch (error) {
    return handleProjectError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const body = await readJsonBody(request);

  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    const project = await updateProject(projectId, user.id, {
      projectName: body.projectName,
      profileText: body.profileText
    });

    return successResponse({ project });
  } catch (error) {
    return handleProjectError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireApiUser();
    const { projectId } = await context.params;
    const deletedProject = await deleteProject(projectId, user.id);

    return successResponse({ project: deletedProject });
  } catch (error) {
    return handleProjectError(error);
  }
}
