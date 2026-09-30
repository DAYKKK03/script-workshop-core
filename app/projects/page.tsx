import { AppShell } from "@/components/app-shell";
import { ButtonLink, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/projects/service";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return (
    <AppShell active="projects" account={user.account}>
      <PageHeader
        title="商家项目"
        description="每个商家项目只维护项目名称和一段店铺资料文本。这里仅展示当前登录账号自己的项目。"
        actions={<ButtonLink href="/projects/new">新建项目</ButtonLink>}
      />
      {projects.length ? (
        <div className="space-y-4">
          {projects.map((project) => (
            <Panel key={project.id}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#f8fafc]">
                    {project.projectName}
                  </h2>
                  <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-[#cbd5e1]">
                    {project.profileText}
                  </p>
                  <p className="mt-3 text-xs text-[#94a3b8]">
                    更新时间：{project.updatedAt.toLocaleString("zh-CN")}
                  </p>
                </div>
                <ButtonLink href={`/projects/${project.id}/edit`} variant="secondary">
                  查看/编辑
                </ButtonLink>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <p className="text-sm leading-6 text-[#cbd5e1]">
            当前还没有商家项目。先新建一个项目，后续生成脚本时会使用这里保存的最新店铺资料。
          </p>
        </Panel>
      )}
    </AppShell>
  );
}
