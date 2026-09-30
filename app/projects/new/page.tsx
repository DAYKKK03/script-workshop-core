import { AppShell } from "@/components/app-shell";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export default async function NewProjectPage() {
  const user = await requireUser();

  return (
    <AppShell active="projects" account={user.account}>
      <PageHeader
        title="新建商家项目"
        description="只需要填写项目名称和一段完整的店铺资料。后续生成脚本会读取这里保存的最新资料。"
      />
      <Panel>
        <ProjectForm mode="create" />
      </Panel>
    </AppShell>
  );
}
