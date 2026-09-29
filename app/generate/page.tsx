import { AppShell } from "@/components/app-shell";
import { TranscriptExtractForm } from "@/components/generate/transcript-extract-form";
import { ButtonLink, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/projects/service";

export default async function GeneratePage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);
  const projectOptions = projects.map((project) => ({
    id: project.id,
    projectName: project.projectName,
    updatedAtLabel: project.updatedAt.toLocaleString("zh-CN")
  }));
  const defaultProjectId = projectOptions[0]?.id ?? "";

  return (
    <AppShell active="generate" account={user.account}>
      <PageHeader
        title="抖音脚本拆解与生成"
        description="粘贴抖音视频链接，自动提取口播文案并拆解结构，再结合商家资料生成新口播脚本。"
      />
      {projects.length ? (
        <TranscriptExtractForm
          defaultProjectId={defaultProjectId}
          projects={projectOptions}
        />
      ) : (
        <Panel>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#cbd5e1]">
              请先创建商家项目，再进入脚本拆解与生成流程。
            </p>
            <ButtonLink href="/projects/new">新建商家项目</ButtonLink>
          </div>
        </Panel>
      )}
    </AppShell>
  );
}
