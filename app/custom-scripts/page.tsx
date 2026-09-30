import { AppShell } from "@/components/app-shell";
import { CustomScriptWorkbench } from "@/components/custom-scripts/custom-script-workbench";
import { ButtonLink, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/projects/service";

export default async function CustomScriptsPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);
  const options = projects.map((project) => ({
    id: project.id,
    projectName: project.projectName
  }));

  return (
    <AppShell active="customScripts" account={user.account}>
      <PageHeader
        title="定制化脚本"
        description="说清楚你想拍什么，或粘贴爆款选题方案。目标约200—350字，实际以完整口播为准。"
      />
      {options.length ? (
        <CustomScriptWorkbench projects={options} defaultProjectId={options[0].id} />
      ) : (
        <Panel>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#cbd5e1]">
              请先创建商家项目并填写资料，再生成定制化脚本。
            </p>
            <ButtonLink href="/projects/new">新建商家项目</ButtonLink>
          </div>
        </Panel>
      )}
    </AppShell>
  );
}
