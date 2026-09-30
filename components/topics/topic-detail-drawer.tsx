"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { formatTopicForCopy, type TopicCopyProject } from "./topic-copy";
import type { TopicIdea } from "./topic-types";

export function TopicDetailDrawer({ idea, project, onClose }: { idea: TopicIdea | null; project: TopicCopyProject | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    if (!idea) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const dialog = closeRef.current?.closest('[role="dialog"]');
        const controls = dialog?.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [idea, onClose]);

  if (!idea) return null;
  async function copy() {
    if (!project) { setCopyState("failed"); return; }
    try { await navigator.clipboard.writeText(formatTopicForCopy(idea!, project)); setCopyState("done"); setTimeout(() => setCopyState("idle"), 2000); }
    catch { setCopyState("failed"); }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/65" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="topic-detail-title" onMouseDown={(e) => e.stopPropagation()} className="glass-readable absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl border border-white/15 bg-[#090b12] shadow-2xl md:inset-y-0 md:left-auto md:w-[500px] md:max-h-none md:rounded-none">
        <header className="flex items-center justify-between border-b border-white/10 p-5">
          <h2 id="topic-detail-title" className="text-lg font-bold text-white">选题详情</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭选题详情" className="focus-ring grid h-11 w-11 place-items-center rounded-md border border-white/12 bg-white/8"><X size={19}/></button>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 pb-8">
          <div className="flex flex-wrap gap-2"><Tag>{idea.keyword}</Tag><Tag>{idea.audienceScene}</Tag></div>
          <h3 className="text-2xl font-bold leading-9 text-white">{idea.title}</h3>
          <Detail label="开篇文案" value={idea.opening}/><Detail label="核心钩子" value={idea.hook}/>
          <div><p className="mb-2 text-sm font-semibold text-[#ffb14a]">爆款元素</p><div className="flex flex-wrap gap-2">{idea.viralElements.map((item) => <Tag key={item}>{item}</Tag>)}</div></div>
          <Detail label="爆款元素应用说明" value={idea.viralElementReason}/>
        </div>
        <footer className="border-t border-white/10 bg-[#090b12] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={copy} className="focus-ring orange-gradient flex min-h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold text-white">{copyState === "done" ? <Check size={17}/> : <Copy size={17}/>} {copyState === "done" ? "已复制" : "复制选题方案"}</button>
          {copyState === "failed" ? <p role="alert" className="mt-2 text-sm text-[#ff9b92]">复制失败，请重试</p> : null}
        </footer>
      </section>
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) { return <span className="rounded-full border border-[#ffb14a]/25 bg-[#ff7a1a]/10 px-2.5 py-1 text-xs text-[#ffd4ad]">{children}</span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><p className="mb-2 text-sm font-semibold text-[#ffb14a]">{label}</p><p className="whitespace-pre-wrap text-sm leading-7 text-[#dbe4f0]">{value}</p></div>; }
