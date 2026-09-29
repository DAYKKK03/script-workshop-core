import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CustomScriptWorkbench } from "@/components/custom-scripts/custom-script-workbench";
import {
  customScriptPreviewRequest,
  customScriptPreviewStates,
  getCustomScriptPreviewResult,
  isCustomScriptPreviewEnabled
} from "@/components/custom-scripts/custom-script-preview";
import type { CustomScriptPreviewState } from "@/components/custom-scripts/custom-script-types";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomScriptsPreviewPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (!isCustomScriptPreviewEnabled(process.env.NODE_ENV)) notFound();

  const params = await searchParams;
  const state = isPreviewState(params.state) ? params.state : "empty";
  const initialRequestText = state === "empty" ? "" : customScriptPreviewRequest;

  return (
    <AppShell active="customScripts" account="开发预览">
      <div
        className="mb-5 rounded-lg border border-[#ffb14a]/30 bg-[#ff7a1a]/10 px-4 py-3 text-sm leading-6 text-[#ffd4ad]"
        role="note"
      >
        仅开发环境静态预览：使用固定样本，不调用AI、不保存结果，也不代表生成服务已经接通。
      </div>
      <PageHeader
        title="定制化脚本"
        description="静态页面验收入口，用于检查桌面端、移动端和各结果状态。"
        actions={
          <nav aria-label="预览状态" className="flex flex-wrap gap-2">
            {customScriptPreviewStates.map((previewState) => (
              <Link
                className={`custom-script-motion focus-ring inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-semibold transition ${
                  state === previewState
                    ? "border-[#ff7a1a]/60 bg-[#ff7a1a]/15 text-[#ffd4ad]"
                    : "border-white/15 bg-white/5 text-[#cbd5e1] hover:bg-white/10"
                }`}
                href={`/custom-scripts/preview?state=${previewState}`}
                key={previewState}
              >
                {previewState}
              </Link>
            ))}
          </nav>
        }
      />
      <CustomScriptWorkbench
        defaultProjectId="preview-project"
        initialRequestText={initialRequestText}
        initialResult={getCustomScriptPreviewResult(state)}
        previewMode
        projects={[{ id: "preview-project", projectName: "小岛西点烘焙" }]}
      />
    </AppShell>
  );
}

function isPreviewState(value: string | undefined): value is CustomScriptPreviewState {
  return customScriptPreviewStates.some((state) => state === value);
}
