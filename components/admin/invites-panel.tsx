"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Invite = { code: string; status: string; createdAt: string | Date; usedAt: string | Date | null };

export function InvitesPanel({ codes, counts }: { codes: Invite[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [generated, setGenerated] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="已使用" value={counts.used || 0} /><Metric label="剩余可用" value={counts.unused || 0} /><Metric label="已禁用" value={counts.disabled || 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="rounded-md border border-[#dfe4ea] bg-white p-4" onSubmit={async (event) => {
          event.preventDefault(); const count = Number(new FormData(event.currentTarget).get("count"));
          const response = await fetch("/api/admin/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count }) });
          const payload = await response.json();
          if (response.ok) { setGenerated(payload.data.codes); setMessage("邀请码已生成，仅本次显示完整内容"); router.refresh(); } else setMessage(payload?.error?.message || "生成失败");
        }}>
          <h2 className="font-semibold">生成邀请码</h2>
          <div className="mt-3 flex gap-2"><input name="count" type="number" min={1} max={100} defaultValue={1} className="h-10 w-28 rounded-md border border-[#d0d5dd] px-3" /><button className="h-10 rounded-md bg-[#175cd3] px-4 text-sm text-white">生成</button></div>
          {message ? <p className="mt-3 text-sm text-[#475467]">{message}</p> : null}
          {generated.length ? <textarea readOnly value={generated.join("\n")} className="mt-3 h-36 w-full rounded-md border border-[#d0d5dd] p-3 font-mono text-sm" /> : null}
        </form>
        <form className="rounded-md border border-[#dfe4ea] bg-white p-4" onSubmit={async (event) => {
          event.preventDefault(); const code = new FormData(event.currentTarget).get("code");
          const response = await fetch("/api/admin/invites", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
          const payload = await response.json(); setMessage(response.ok ? "邀请码已禁用" : payload?.error?.message || "禁用失败"); if (response.ok) { event.currentTarget.reset(); router.refresh(); }
        }}>
          <h2 className="font-semibold">禁用邀请码</h2><p className="mt-1 text-sm text-[#667085]">需要输入完整邀请码，避免误操作。</p>
          <div className="mt-3 flex gap-2"><input required name="code" className="h-10 min-w-0 flex-1 rounded-md border border-[#d0d5dd] px-3" /><button className="h-10 rounded-md border border-[#d0d5dd] px-4 text-sm">禁用</button></div>
        </form>
      </div>
      <div className="overflow-x-auto rounded-md border border-[#dfe4ea] bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[#f9fafb] text-[#667085]"><tr><th className="px-4 py-3">邀请码</th><th>状态</th><th>创建时间</th><th>使用时间</th></tr></thead><tbody className="divide-y divide-[#eaecf0]">{codes.map((code, index) => <tr key={`${code.code}-${index}`}><td className="px-4 py-3 font-mono">{code.code}</td><td>{statusLabel(code.status)}</td><td>{formatDate(code.createdAt)}</td><td>{code.usedAt ? formatDate(code.usedAt) : "-"}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-md border border-[#dfe4ea] bg-white p-4"><p className="text-sm text-[#667085]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
function statusLabel(value: string) { return value === "used" ? "已使用" : value === "unused" ? "可用" : "已禁用"; }
function formatDate(value: string | Date) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
