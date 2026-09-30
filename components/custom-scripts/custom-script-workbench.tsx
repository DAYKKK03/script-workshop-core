"use client";

import { useMemo, useState } from "react";
import { FileInput, LoaderCircle, Sparkles, Store, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dangerMessageClassName, inputClassName, Panel } from "@/components/ui";
import {
  countNormalizedCustomScriptCodePoints
} from "@/lib/custom-scripts/text";
import {
  classifyCustomScriptInput,
  resolveObjectiveForSourceChange
} from "./custom-script-input";
import { CustomScriptResultPanel } from "./custom-script-result-panel";
import { SegmentedOptions } from "./segmented-options";
import { useCustomScriptJob } from "./use-custom-script-job";
import {
  objectiveOptions,
  toneOptions,
  type CustomScriptDraft,
  type CustomScriptObjective,
  type CustomScriptProjectOption,
  type CustomScriptResult,
  type CustomScriptTone
} from "./custom-script-types";

type CustomScriptWorkbenchProps = {
  projects: CustomScriptProjectOption[];
  defaultProjectId: string;
  initialRequestText?: string;
  initialResult?: CustomScriptResult;
  previewMode?: boolean;
};

export function CustomScriptWorkbench({
  projects,
  defaultProjectId,
  initialRequestText = "",
  initialResult = { status: "initial" },
  previewMode = false
}: CustomScriptWorkbenchProps) {
  const initialClassification = classifyCustomScriptInput(initialRequestText);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [requestText, setRequestText] = useState(initialRequestText);
  const [objective, setObjective] = useState<CustomScriptObjective>(
    resolveObjectiveForSourceChange({ kind: "empty", label: "等待输入" }, initialClassification, "auto")
  );
  const [tone, setTone] = useState<CustomScriptTone>("auto");
  const job = useCustomScriptJob({ enabled: !previewMode, initialResult });
  const result = job.result;
  const classification = useMemo(() => classifyCustomScriptInput(requestText), [requestText]);
  const requestLength = countNormalizedCustomScriptCodePoints(requestText);
  const validationMessage = validateDraft(projectId, requestText, classification);
  const sourceMismatch =
    (classification.kind === "topic" || classification.kind === "top_pick") &&
    classification.sourceProjectId !== projectId;
  const selectedProject = projects.find((project) => project.id === projectId);
  const canSubmit = !previewMode && !validationMessage && !sourceMismatch && !job.processing;

  function clearResult() {
    job.clear();
  }

  function changeRequest(nextValue: string) {
    const previous = classification;
    const next = classifyCustomScriptInput(nextValue);
    setRequestText(nextValue);
    setObjective((current) => resolveObjectiveForSourceChange(previous, next, current));
    clearResult();
  }

  async function submit() {
    if (!canSubmit) return;
    const source: Pick<CustomScriptDraft, "sourceProjectId" | "sourceType" | "sourceObjective"> =
      classification.kind === "topic" || classification.kind === "top_pick"
        ? {
            sourceProjectId: classification.sourceProjectId,
            sourceType: classification.kind,
            sourceObjective: classification.sourceObjective
          }
        : {};
    await job.submit({ projectId, requestText, objective, tone, ...source });
  }

  return (
    <div className="custom-script-workbench space-y-5">
      <Panel>
        <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Store className="text-[#ffb14a]" size={17} />
              商家项目
            </span>
            <select
              className={`${inputClassName} custom-script-motion min-h-11`}
              disabled={job.processing}
              value={projectId}
              onChange={(event) => { setProjectId(event.target.value); clearResult(); }}
            >
              {projects.map((project) => (
                <option className="bg-[#11131a]" key={project.id} value={project.id}>
                  {project.projectName}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-[#94a3b8]">
              生成时只使用“{selectedProject?.projectName}”最新保存的商家资料。
            </p>
          </label>

          <label className="block">
            <span className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileInput className="text-[#ffb14a]" size={17} />
                你想生成什么脚本
              </span>
              <span className="flex items-center justify-between gap-3 text-xs text-[#94a3b8]">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[#cbd5e1]">
                  {classification.label}
                </span>
                <span>{requestLength}/5000</span>
              </span>
            </span>
            <textarea
              className={`${inputClassName} custom-script-motion min-h-52 resize-y py-3 leading-6`}
              disabled={job.processing}
              placeholder="例如：写一条面向附近上班族的下午茶口播，突出当天现做，语气像朋友推荐。也可以粘贴爆款选题方案。"
              value={requestText}
              onChange={(event) => changeRequest(event.target.value)}
            />
            <p className="mt-2 text-xs leading-5 text-[#94a3b8]">
              未带来源标记的旧选题会按自由需求处理，并以当前选择的商家项目为准。
            </p>
          </label>

          {classification.kind === "invalid_source" ? (
            <div className={dangerMessageClassName} role="alert">
              <TriangleAlert className="mr-2 inline" size={16} />
              {classification.message}
            </div>
          ) : null}
          {sourceMismatch ? (
            <div className={dangerMessageClassName} role="alert">
              <TriangleAlert className="mr-2 inline" size={16} />
              这条爆款选题来自其他商家项目，请切换到来源项目或重新复制选题。
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <SegmentedOptions
              legend="内容目标"
              name="custom-script-objective"
              options={objectiveOptions}
              value={objective}
              disabled={job.processing}
              onChange={(value) => { setObjective(value); clearResult(); }}
            />
            <SegmentedOptions
              legend="表达风格"
              name="custom-script-tone"
              options={toneOptions}
              value={tone}
              disabled={job.processing}
              onChange={(value) => { setTone(value); clearResult(); }}
            />
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <Button className="custom-script-motion min-h-11 w-full px-6 sm:w-auto" disabled={!canSubmit} type="submit">
              {result.status === "processing" ? <LoaderCircle className="custom-script-spinner animate-spin" size={17} /> : <Sparkles size={17} />}
              {result.status === "processing" ? "生成中..." : "生成完整口播脚本"}
            </Button>
            {validationMessage ? (
              <p className="text-xs text-[#ff9b92]" role="alert">{validationMessage}</p>
            ) : null}
          </div>
        </form>
      </Panel>

      <CustomScriptResultPanel
        result={result}
        onCancel={result.status === "processing"
          ? previewMode
            ? () => job.setPreviewResult({ status: "canceled" })
            : () => void job.cancel()
          : undefined}
        onRegenerate={result.status === "success"
          ? previewMode
            ? () => job.setPreviewResult(initialResult)
            : job.canRegenerate
              ? () => void job.regenerate(result.finalScript)
              : undefined
          : undefined}
        onRetryRegeneration={(result.status === "failed" || result.status === "canceled") && job.canRetryRegeneration
          ? () => void job.retryRegeneration()
          : undefined}
      />
    </div>
  );
}

function validateDraft(
  projectId: string,
  requestText: string,
  classification: ReturnType<typeof classifyCustomScriptInput>
) {
  if (!projectId) return "请先选择商家项目";
  const requestLength = countNormalizedCustomScriptCodePoints(requestText);
  if (requestLength < 5) return "请至少填写5个字的脚本需求";
  if (requestLength > 5000) return "输入内容不能超过5000字";
  if (classification.kind === "invalid_source") return classification.message;
  return "";
}
