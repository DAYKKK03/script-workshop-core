"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleX,
  Clipboard,
  FileText,
  LoaderCircle,
  RefreshCw,
  Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui";
import { countCustomScriptCodePoints } from "@/lib/custom-scripts/text";
import {
  missingFactLabels,
  type CustomScriptResult
} from "./custom-script-types";

export function CustomScriptResultPanel({
  result,
  onCancel,
  onRegenerate,
  onRetryRegeneration
}: {
  result: CustomScriptResult;
  onCancel?: () => void;
  onRegenerate?: () => void;
  onRetryRegeneration?: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyScript(script: string) {
    try {
      await navigator.clipboard.writeText(script);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2_000);
    } catch {
      setCopyStatus("failed");
    }
  }

  if (result.status === "processing") {
    return (
      <Panel className="border-[#ffb14a]/25 bg-[#ff7a1a]/8">
        <div className="flex min-h-52 flex-col items-center justify-center gap-4 text-center" role="status">
          <LoaderCircle className="custom-script-spinner animate-spin text-[#ffb14a]" size={30} />
          <div>
            <h2 className="text-lg font-semibold text-white">正在生成口播脚本</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">正在结合商家资料和你的要求，请稍候。</p>
          </div>
          <Button className="custom-script-motion min-h-11" disabled={!onCancel} variant="outline" onClick={onCancel}>
            <Square size={15} />
            取消生成
          </Button>
        </div>
      </Panel>
    );
  }

  if (result.status === "success") {
    const characterCount = countCustomScriptCodePoints(result.finalScript);

    return (
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#43d18b]">生成完成</p>
            <h2 className="mt-2 text-xl font-bold text-white">完整口播脚本</h2>
          </div>
          <span className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#cbd5e1]">
            {characterCount} 字
          </span>
        </div>
        <div
          aria-label="生成的口播脚本"
          className="glass-readable mt-5 whitespace-pre-wrap rounded-lg border border-white/10 p-4 text-[15px] leading-8 text-[#e2e8f0] sm:p-6"
          role="textbox"
          aria-readonly="true"
        >
          {result.finalScript}
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#ffcf9f]">
          <AlertTriangle className="mt-0.5 shrink-0" size={14} />
          结果仅临时保留30分钟且不进入历史，请及时复制。
        </p>
        {!onRegenerate ? (
          <p className="mt-3 text-xs leading-5 text-[#94a3b8]">
            刷新后原生成条件已清理，请重新填写条件后生成新版本。
          </p>
        ) : null}
        {copyStatus === "failed" ? (
          <p className="mt-3 text-sm text-[#ff9b92]" role="alert">
            复制失败，请允许浏览器访问剪贴板后重试。
          </p>
        ) : null}
        <div className="mt-5 grid gap-3 sm:flex sm:justify-end">
          {onRegenerate ? (
            <Button className="custom-script-motion min-h-11" variant="outline" onClick={onRegenerate}>
              <RefreshCw size={16} />
              换一版
            </Button>
          ) : null}
          <Button className="custom-script-motion min-h-11" onClick={() => void copyScript(result.finalScript)}>
            {copyStatus === "copied" ? <Check size={16} /> : <Clipboard size={16} />}
            {copyStatus === "copied" ? "已复制" : "复制完整脚本"}
          </Button>
        </div>
      </Panel>
    );
  }

  if (result.status === "needs_profile") {
    return (
      <Panel className="border-[#ffb14a]/25">
        <div role="alert" className="flex items-start gap-3">
          <AlertTriangle className="mt-1 shrink-0 text-[#ffb14a]" size={20} />
          <div>
            <h2 className="text-lg font-semibold text-white">商家资料还不够完整</h2>
            <p className="mt-2 text-sm leading-6 text-[#cbd5e1]">
              为避免编造信息，请先补充以下内容，再回来生成脚本：
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.missingFacts.map((fact) => (
                <li key={fact} className="rounded-full border border-[#ffb14a]/25 bg-[#ff7a1a]/10 px-3 py-1 text-xs text-[#ffd4ad]">
                  {missingFactLabels[fact]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    );
  }

  if (result.status === "failed") {
    return (
      <Panel className="border-[#ff6b5f]/25">
        <div className="flex items-start gap-3" role="alert">
          <CircleX className="mt-1 shrink-0 text-[#ff8b82]" size={20} />
          <div>
            <h2 className="text-lg font-semibold text-white">生成失败</h2>
            <p className="mt-2 text-sm leading-6 text-[#ffd3ce]">{result.message}</p>
          </div>
        </div>
        {onRetryRegeneration ? (
          <div className="mt-5 flex justify-end">
            <Button className="custom-script-motion min-h-11" variant="outline" onClick={onRetryRegeneration}>
              <RefreshCw size={16} />
              重试换一版
            </Button>
          </div>
        ) : null}
      </Panel>
    );
  }

  if (result.status === "canceled") {
    return (
      <Panel>
        <div className="flex items-start gap-3" role="status">
          <CircleX className="mt-1 shrink-0 text-[#94a3b8]" size={20} />
          <div>
            <h2 className="text-lg font-semibold text-white">任务已取消</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">你可以调整生成条件后重新提交。</p>
          </div>
        </div>
        {onRetryRegeneration ? (
          <div className="mt-5 flex justify-end">
            <Button className="custom-script-motion min-h-11" variant="outline" onClick={onRetryRegeneration}>
              <RefreshCw size={16} />
              重试换一版
            </Button>
          </div>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex min-h-52 flex-col items-center justify-center text-center">
        <FileText className="text-[#64748b]" size={30} />
        <h2 className="mt-4 text-lg font-semibold text-white">脚本将在这里显示</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-[#94a3b8]">
          填写创作要求后即可生成。目标约200—350字，实际以完整口播为准。
        </p>
      </div>
    </Panel>
  );
}
