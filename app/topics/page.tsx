import { AppShell } from "@/components/app-shell";
import { TopicIdeasWorkbench } from "@/components/topics/topic-ideas-workbench";
import { ButtonLink, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/projects/service";

export default async function TopicsPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);
  const options = projects.map((project) => ({
    id: project.id,
    projectName: project.projectName,
    updatedAtLabel: project.updatedAt.toLocaleString("zh-CN")
  }));

  return (
    <AppShell active="topics" account={user.account}>
      <PageHeader
        title="爆款选题"
        description="结合商家最新资料识别赛道，生成25个更贴合门店的短视频选题，并推荐最值得优先拍的3个方向。"
      />
      {options.length ? (
        <TopicIdeasWorkbench projects={options} defaultProjectId={options[0].id} />
      ) : (
        <Panel>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#cbd5e1]">请先创建商家项目，再生成爆款选题。</p>
            <ButtonLink href="/projects/new">新建商家项目</ButtonLink>
          </div>
        </Panel>
      )}
    </AppShell>
  );
}
