import "server-only";

import { prisma } from "@/lib/prisma";
import { ProjectError } from "@/lib/projects/service";

export async function deleteProject(projectId: string, userId: string) {
  const result = await prisma.project.deleteMany({ where: { id: projectId, userId } });
  if (result.count !== 1) throw new ProjectError("PROJECT_NOT_FOUND", "项目不存在", 404);
  return { id: projectId };
}
