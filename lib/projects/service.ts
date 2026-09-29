import { prisma } from "@/lib/prisma";

export class ProjectError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateProjectInput(input: {
  projectName: unknown;
  profileText: unknown;
}) {
  const projectName = normalizeText(input.projectName);
  const profileText = normalizeText(input.profileText);

  if (!projectName) {
    throw new ProjectError("PROJECT_NAME_REQUIRED", "请输入项目名称");
  }

  if (!profileText) {
    throw new ProjectError("PROFILE_TEXT_REQUIRED", "请输入店铺资料");
  }

  if (projectName.length > 80) {
    throw new ProjectError("PROJECT_NAME_TOO_LONG", "项目名称不能超过 80 个字符");
  }

  if (profileText.length > 20_000) {
    throw new ProjectError("PROFILE_TEXT_TOO_LONG", "店铺资料不能超过 20000 个字符");
  }

  return {
    projectName,
    profileText
  };
}

export async function listProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      projectName: true,
      profileText: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function createProject(
  userId: string,
  input: { projectName: unknown; profileText: unknown }
) {
  const data = validateProjectInput(input);

  return prisma.project.create({
    data: {
      ...data,
      userId
    },
    select: {
      id: true,
      projectName: true,
      profileText: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function getProjectForUser(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      userId
    },
    select: {
      id: true,
      projectName: true,
      profileText: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function updateProject(
  projectId: string,
  userId: string,
  input: { projectName: unknown; profileText: unknown }
) {
  const data = validateProjectInput(input);
  const project = await getProjectForUser(projectId, userId);

  if (!project) {
    throw new ProjectError("PROJECT_NOT_FOUND", "项目不存在", 404);
  }

  return prisma.project.update({
    where: { id: projectId },
    data,
    select: {
      id: true,
      projectName: true,
      profileText: true,
      createdAt: true,
      updatedAt: true
    }
  });
}
