import { AppShell } from "@/components/app-shell";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getProjectForUser } from "@/lib/projects/service";
import { notFound } from "next/navigation";

export default async function EditProjectPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const project = await getProjectForUser(projectId, user.id);

  if (!project) {
    notFound();
  }

  return (
    <AppShell active="projects" account={user.account}>
      <PageHeader
        title="编辑商家项目"
        description="修改这里的店铺资料后，后续脚本生成会读取最新保存内容。"
      />
      <Panel>
        <ProjectForm
          initialProfileText={project.profileText}
          initialProjectName={project.projectName}
          mode="edit"
          projectId={project.id}
        />
      </Panel>
    </AppShell>
  );
}
