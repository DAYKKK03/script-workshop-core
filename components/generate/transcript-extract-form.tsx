"use client";

import { Fragment, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Info,
  Link as LinkIcon,
  RefreshCw,
  Sparkles,
  Store,
  WandSparkles,
  X
} from "lucide-react";
import {
  dangerMessageClassName,
  inputClassName,
  Panel,
  readableBoxClassName,
  successMessageClassName
} from "@/components/ui";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { douyinTranscriptFailureMessage } from "@/lib/douyin/transcript-constants";
import {
  getGenerationInputResetScope,
  getSourceResetScope,
  getUsableExtractionTranscript
} from "@/lib/douyin/generation-state";
import { extractDouyinUrl } from "@/lib/douyin/source-input";

type ProjectOption = {
  id: string;
  projectName: string;
  updatedAtLabel?: string;
};

type ExtractionJobStatus = "queued" | "processing" | "succeeded" | "failed";

type ExtractionJobResult =
  | {
      id: string;
      status: ExtractionJobStatus;
      message?: string;
      originalTranscript?: string;
    }
  | {
      id: string;
      status: "failed";
      message: string;
    };

type ExtractionJobApiResult =
  | { success: true; data: ExtractionJobResult }
  | { success: false; error: { message: string } };

type ReferenceStructureItem = {
  structureName: string;
  originalText: string;
};

type AnalyzeApiResult =
  | { success: true; data: { referenceStructure: ReferenceStructureItem[] } }
  | { success: false; error: { message: string } };

type GenerateFinalApiResult =
  | { success: true; data: { finalScript: string } }
  | { success: false; error: { message: string } };

const durationOptions = [
  { value: "15-30", label: "15-30秒" },
  { value: "30-60", label: "30-60秒" },
  { value: "60-90", label: "60-90秒" }
];

const orangeButtonClassName =
  "focus-ring orange-gradient inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold text-white shadow-[0_12px_32px_rgba(217,95,19,0.24)] transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100";
const extractionPollIntervalMs = 3000;
const extractionMaxPolls = 120;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function TranscriptExtractForm({
  projects,
  defaultProjectId
}: {
  projects: ProjectOption[];
  defaultProjectId: string;
}) {
  const [message, setMessage] = useState("");
  const [originalTranscript, setOriginalTranscript] = useState("");
  const [referenceStructure, setReferenceStructure] = useState<
    ReferenceStructureItem[]
  >([]);
  const [finalScript, setFinalScript] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId);
  const [douyinUrl, setDouyinUrl] = useState("");
  const [referenceSourceUrl, setReferenceSourceUrl] = useState("");
  const [duration, setDuration] = useState("30-60");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  );
  const steps = [
    {
      label: "自动提取",
      done: Boolean(originalTranscript),
      active: isSubmitting && !originalTranscript
    },
    {
      label: "参考结构拆解",
      done: Boolean(referenceStructure.length),
      active: Boolean(originalTranscript) && !referenceStructure.length && isSubmitting
    },
    {
      label: "生成最终文案",
      done: Boolean(finalScript),
      active: isGenerating
    }
  ];

  function clearFinalOutput() {
    setFinalScript("");
    setCopyMessage("");
  }

  function handleSourceChange(value: string) {
    setDouyinUrl(value);
    setMessage("");

    if (
      getSourceResetScope(referenceSourceUrl, extractDouyinUrl(value)) ===
      "reference-and-final"
    ) {
      setOriginalTranscript("");
      setReferenceStructure([]);
      setReferenceSourceUrl("");
      clearFinalOutput();
    }
  }

  function handleProjectChange(projectId: string) {
    if (
      getGenerationInputResetScope(selectedProjectId, projectId) ===
      "final-only"
    ) {
      clearFinalOutput();
      setMessage("");
    }

    setSelectedProjectId(projectId);
  }

  function handleDurationChange(nextDuration: string) {
    if (
      getGenerationInputResetScope(duration, nextDuration) === "final-only"
    ) {
      clearFinalOutput();
      setMessage("");
    }

    setDuration(nextDuration);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const normalizedSourceUrl = extractDouyinUrl(douyinUrl);

    if (!normalizedSourceUrl) {
      setMessage(douyinTranscriptFailureMessage);
      return;
    }

    setMessage("");
    setProgressMessage("正在创建提取任务...");
    setOriginalTranscript("");
    setReferenceStructure([]);
    setReferenceSourceUrl("");
    setFinalScript("");
    setCopyMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/douyin/extraction-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          douyinUrl,
          projectId: selectedProjectId
        })
      });
      const result = (await response.json()) as ExtractionJobApiResult;

      if (!result.success) {
        setMessage(result.error.message);
        setProgressMessage("");
        return;
      }

      const jobResult = await pollExtractionJob(result.data.id, (status) => {
        setProgressMessage(
          status === "queued"
            ? "正在排队提取口播文案..."
            : "正在提取并转写口播文案..."
        );
      });

      const extractedTranscript = getUsableExtractionTranscript(jobResult);

      if (!extractedTranscript) {
        setMessage(jobResult.message || douyinTranscriptFailureMessage);
        setProgressMessage("");
        return;
      }

      setOriginalTranscript(extractedTranscript);
      setProgressMessage("口播文案已提取，正在拆解参考结构...");

      const analyzeResponse = await fetch("/api/scripts/analyze-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalTranscript: extractedTranscript
        })
      });
      const analyzeResult = (await analyzeResponse.json()) as AnalyzeApiResult;

      if (!analyzeResult.success) {
        setMessage(analyzeResult.error.message);
        setProgressMessage("");
        return;
      }

      setReferenceStructure(analyzeResult.data.referenceStructure);
      setReferenceSourceUrl(normalizedSourceUrl);
      setProgressMessage("");
    } catch {
      setMessage(douyinTranscriptFailureMessage);
      setProgressMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function pollExtractionJob(
    jobId: string,
    onWaiting: (status: ExtractionJobStatus) => void
  ): Promise<ExtractionJobResult> {
    for (let attempt = 0; attempt < extractionMaxPolls; attempt += 1) {
      const response = await fetch(`/api/douyin/extraction-jobs/${jobId}`, {
        method: "GET"
      });
      const result = (await response.json()) as ExtractionJobApiResult;

      if (!result.success) {
        return {
          id: jobId,
          status: "failed",
          message: result.error.message
        };
      }

      if (
        result.data.status === "succeeded" ||
        result.data.status === "failed"
      ) {
        return result.data;
      }

      onWaiting(result.data.status);
      await sleep(extractionPollIntervalMs);
    }

    return {
      id: jobId,
      status: "failed",
      message: douyinTranscriptFailureMessage
    };
  }

  async function handleGenerateFinalScript() {
    if (isGenerating || !referenceStructure.length) {
      return;
    }

    setMessage("");
    setFinalScript("");
    setCopyMessage("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/scripts/generate-final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          duration,
          referenceStructure
        })
      });
      const result = (await response.json()) as GenerateFinalApiResult;

      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      setFinalScript(result.data.finalScript);
    } catch {
      setMessage("完整口播文案生成失败，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopyFinalScript() {
    if (!finalScript) {
      return;
    }

    setCopyMessage("");

    try {
      await navigator.clipboard.writeText(finalScript);
      setCopyMessage("已复制到剪贴板");
    } catch {
      setCopyMessage("复制失败，请手动复制");
    }
  }

  return (
    <div className="space-y-8">
      <Panel className="border-[#ffb14a]/20 bg-[rgba(12,12,14,0.68)] p-5 lg:p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 xl:grid-cols-[minmax(190px,0.9fr)_minmax(300px,1.45fr)_minmax(270px,1fr)_190px] xl:items-end">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#f8fafc]">
                <Store size={15} className="text-[#ffb14a]" />
                商家项目
              </span>
              <input
                name="projectId"
                readOnly
                type="hidden"
                value={selectedProjectId}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="workbench-soft-button focus-ring group flex h-[42px] w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-white transition data-[state=open]:border-[#ffb14a]/42 data-[state=open]:bg-[#ff7a1a]/22 data-[state=open]:shadow-[0_0_0_4px_rgba(255,122,26,0.12),0_12px_30px_rgba(217,95,19,0.16)]"
                    type="button"
                  >
                    <span className="truncate">
                      {selectedProject?.projectName || "请选择商家项目"}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="shrink-0 text-white/85 transition group-data-[state=open]:rotate-180"
                      size={16}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="min-w-[var(--radix-dropdown-menu-trigger-width)] border-[#ffb14a]/20 bg-[rgba(13,13,16,0.96)] p-2 shadow-[0_18px_60px_rgba(0,0,0,0.42),0_0_28px_rgba(255,122,26,0.12)]"
                >
                  <DropdownMenuLabel className="px-2 pb-2 pt-1 text-[12px] text-[#94a3b8]">
                    选择一个商家项目
                  </DropdownMenuLabel>
                  <DropdownMenuGroup className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {projects.map((project) => {
                      const isSelected = project.id === selectedProjectId;

                      return (
                        <DropdownMenuItem
                          className={`min-h-11 cursor-pointer rounded-md border px-3 py-2 transition ${
                            isSelected
                              ? "border-[#ffb14a]/30 bg-[#ff7a1a]/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_16px_rgba(255,122,26,0.12)]"
                              : "border-[#ffb14a]/12 bg-[#ff7a1a]/7 text-[#f8fafc] hover:border-[#ffb14a]/30 hover:bg-[#ff7a1a]/16 hover:text-white hover:shadow-[0_0_14px_rgba(255,122,26,0.1)] focus:border-[#ffb14a]/32 focus:bg-[#ff7a1a]/16 focus:text-white"
                          }`}
                          key={project.id}
                          onSelect={() => handleProjectChange(project.id)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {project.projectName}
                            </span>
                            {project.updatedAtLabel ? (
                              <span className="mt-0.5 block truncate text-xs text-[#94a3b8]">
                                资料更新时间 {project.updatedAtLabel}
                              </span>
                            ) : null}
                          </span>
                          {isSelected ? (
                            <Check
                              aria-hidden="true"
                              className="shrink-0 text-[#ffb14a]"
                              size={16}
                            />
                          ) : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </label>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#f8fafc]">
                <LinkIcon size={15} className="text-[#ffb14a]" />
                粘贴抖音分享内容
              </span>
              <span className="relative block">
                <input
                  className={`${inputClassName} pr-10`}
                  disabled={isSubmitting}
                  name="douyinUrl"
                  onChange={(event) => handleSourceChange(event.target.value)}
                  placeholder="粘贴抖音分享文本或视频链接"
                  required
                  type="text"
                  value={douyinUrl}
                />
                {douyinUrl ? (
                  <button
                    aria-label="清空链接"
                    className="focus-ring orange-gradient absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-white shadow-[0_8px_22px_rgba(217,95,19,0.24)] transition hover:brightness-110 active:translate-y-[calc(-50%+1px)]"
                    onClick={() => handleSourceChange("")}
                    type="button"
                  >
                    <X size={15} />
                  </button>
                ) : (
                  <ExternalLink
                    aria-hidden="true"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b]"
                    size={15}
                  />
                )}
              </span>
            </label>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-[#f8fafc]">
                脚本时长
              </p>
              <div className="grid grid-cols-3 overflow-hidden rounded-md border border-white/12 bg-white/6">
                {durationOptions.map((item) => (
                  <button
                    className={`focus-ring min-h-10 px-3 py-2 text-[13px] font-semibold text-white shadow-[0_10px_26px_rgba(217,95,19,0.18)] transition hover:brightness-110 active:translate-y-px ${
                      duration === item.value
                        ? "orange-gradient border border-[#ffb14a]/45"
                        : "border border-[#ff7a1a]/22 bg-[#ff7a1a]/18 text-white/72 hover:bg-[#ff7a1a]/34 hover:text-white"
                    }`}
                    key={item.value}
                    onClick={() => handleDurationChange(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              className={`${orangeButtonClassName} h-[42px] w-full px-4 py-2.5`}
              disabled={isSubmitting || !selectedProjectId}
              type="submit"
            >
              <Sparkles size={16} />
              {isSubmitting ? (
                <AnimatedShinyText className="max-w-none text-white">
                  处理中...
                </AnimatedShinyText>
              ) : (
                "自动提取并拆解"
              )}
            </button>
          </div>
          <div className="flex flex-col gap-2 border-t border-white/10 pt-3 text-xs leading-5 text-[#94a3b8] lg:flex-row lg:items-center lg:justify-between">
            <p className="flex items-center gap-2">
              <Info size={14} className="shrink-0 text-[#ffb14a]" />
              {selectedProject
                ? `已选择商家项目：${selectedProject.projectName}${
                    selectedProject.updatedAtLabel
                      ? `，资料更新时间 ${selectedProject.updatedAtLabel}`
                      : ""
                  }`
                : "请选择商家项目"}
            </p>
            <p>支持粘贴抖音完整分享文本或视频链接，不支持输入现成文案或导入媒体文件。</p>
          </div>
          {message ? <p className={dangerMessageClassName}>{message}</p> : null}
          {progressMessage ? (
            <p className={successMessageClassName}>{progressMessage}</p>
          ) : null}
        </form>
      </Panel>

      <Panel className="px-6 py-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          {steps.map((step, index) => (
            <Fragment key={step.label}>
              <div
                className="generate-step-card flex items-center gap-4"
                data-active={step.done || step.active || index === 0}
                key={step.label}
              >
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border text-sm font-bold ${
                    step.done || step.active || index === 0
                      ? "border-[#ffb14a]/50 bg-[#ff7a1a] text-white shadow-[0_0_28px_rgba(255,122,26,0.3)]"
                      : "border-white/18 bg-white/10 text-[#cbd5e1]"
                  }`}
                >
                  {step.active ? <Sparkles size={17} /> : index + 1}
                </span>
                <span>
                  <span
                    className={`block text-sm font-semibold ${
                      step.done || step.active || index === 0
                        ? "text-[#f8fafc]"
                        : "text-[#cbd5e1]"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="mt-1 block text-xs text-[#94a3b8]">
                    {step.done ? "已完成" : step.active ? "进行中" : "等待中"}
                  </span>
                </span>
              </div>
              {index < steps.length - 1 ? (
                <div
                  aria-hidden="true"
                  className="hidden h-px min-w-10 border-t border-dashed border-white/24 md:block"
                />
              ) : null}
            </Fragment>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.12fr)]">
        <Panel className="min-h-[420px]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#f8fafc]">
              <FileText size={18} className="text-[#ffb14a]" />
              参考结构（原文结构拆解）
            </h2>
            <span className="rounded-md bg-white/8 px-2.5 py-1 text-xs text-[#cbd5e1]">
              共{referenceStructure.length || 0}段
            </span>
          </div>
          {referenceStructure.length ? (
            <div className="space-y-3">
              {referenceStructure.map((item, index) => (
                <div
                  className="grid min-h-16 grid-cols-[34px_minmax(0,1fr)_20px] items-center gap-3 rounded-lg border border-white/12 bg-white/7 px-4 py-4"
                  key={`${item.structureName}-${item.originalText}`}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#ff7a1a]/75 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#f8fafc]">
                      {item.structureName}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#cbd5e1]">
                      {item.originalText}
                    </p>
                  </div>
                  <ChevronDown size={18} className="text-[#94a3b8]" />
                </div>
              ))}
              {originalTranscript ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="mb-2 text-sm font-semibold text-[#f8fafc]">
                    自动提取的原口播文案
                  </p>
                  <p className={`${readableBoxClassName} whitespace-pre-wrap leading-7`}>
                    {originalTranscript}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-white/14 bg-white/5 p-6 text-center">
              <div className="max-w-sm">
                <FileText className="mx-auto mb-3 text-[#64748b]" size={28} />
                <p className="text-sm leading-7 text-[#94a3b8]">
                  等待自动提取并拆解参考结构。这里不会展示假结构。
                </p>
              </div>
            </div>
          )}
        </Panel>

        <Panel className="min-h-[420px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#f8fafc]">
              <WandSparkles size={18} className="text-[#ffb14a]" />
              最终口播文案（可直接复制）
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {referenceStructure.length ? (
                <button
                  className={`${orangeButtonClassName} px-3 py-2`}
                  disabled={isGenerating}
                  onClick={handleGenerateFinalScript}
                  type="button"
                >
                  {finalScript ? (
                    <RefreshCw size={15} />
                  ) : (
                    <WandSparkles size={15} />
                  )}
                  {isGenerating ? (
                    <AnimatedShinyText className="max-w-none text-white">
                      生成中...
                    </AnimatedShinyText>
                  ) : finalScript ? (
                    "重新生成"
                  ) : (
                    "生成最终文案"
                  )}
                </button>
              ) : null}
              {finalScript ? (
                <button
                  className={`${orangeButtonClassName} px-3 py-2`}
                  onClick={handleCopyFinalScript}
                  type="button"
                >
                  <Copy size={15} />
                  复制文案
                </button>
              ) : null}
            </div>
          </div>
          {finalScript ? (
            <p className={`${readableBoxClassName} mt-3 whitespace-pre-wrap text-[15px] leading-7`}>
              {finalScript}
            </p>
          ) : (
            <div className="mt-3 grid min-h-[300px] place-items-center rounded-lg border border-dashed border-white/14 bg-white/5 p-6 text-center">
              <div className="max-w-sm">
                <WandSparkles className="mx-auto mb-3 text-[#64748b]" size={28} />
                <p className="text-sm leading-7 text-[#94a3b8]">
                  生成后将在这里展示可复制口播文案。这里不会展示假文案。
                </p>
              </div>
            </div>
          )}
          {copyMessage ? (
            <p className={`${successMessageClassName} mt-3`}>{copyMessage}</p>
          ) : null}
          <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-[#94a3b8]">
            内容基于所选商家资料生成，不会公开展示您的商家信息。
          </p>
        </Panel>
      </div>
    </div>
  );
}
