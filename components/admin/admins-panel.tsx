"use client";

import QRCode from "qrcode";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

type AdminRow = { id: string; account: string; role: "OWNER" | "OPERATOR"; status: "active" | "disabled"; lastLoginAt: Date | string | null };

export function AdminsPanel({ rows }: { rows: AdminRow[] }) {
  const router = useRouter();
  const [totpCode, setTotpCode] = useState("");
  const [setup, setSetup] = useState<{ qr: string; recoveryCodes: string[] } | null>(null);
  const [message, setMessage] = useState("");

  async function createAdmin(form: HTMLFormElement) {
    const values = new FormData(form);
    const response = await fetch("/api/admin/admins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: values.get("account"), password: values.get("password"), role: values.get("role"), totpCode }) });
    const payload = await response.json();
    if (!response.ok) { setMessage(payload?.error?.message || "创建失败"); return; }
    setSetup({ qr: await QRCode.toDataURL(payload.data.provisioningUri, { width: 220, margin: 1 }), recoveryCodes: payload.data.recoveryCodes });
    setMessage("管理员已创建。请立即完成 TOTP 绑定并离线保存恢复码。"); form.reset(); router.refresh();
  }

  async function updateAdmin(row: AdminRow, form: HTMLFormElement) {
    const values = new FormData(form);
    const response = await fetch("/api/admin/admins", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ adminId: row.id, role: values.get("role"), status: values.get("status"), totpCode }) });
    const payload = await response.json(); setMessage(response.ok ? "管理员配置已更新，原会话已撤销" : payload?.error?.message || "更新失败"); if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      <label className="block max-w-xs text-sm font-medium text-[#344054]">二次验证 TOTP<input value={totpCode} onChange={(event) => setTotpCode(event.target.value)} inputMode="numeric" maxLength={6} className="focus-ring mt-1.5 h-10 w-full rounded-md border border-[#d0d5dd] px-3" /></label>
      {message ? <p className="text-sm text-[#475467]">{message}</p> : null}
      <form className="grid gap-3 rounded-md border border-[#dfe4ea] bg-white p-4 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void createAdmin(event.currentTarget); }}>
        <input required name="account" maxLength={64} placeholder="管理员账号" className="h-10 rounded-md border border-[#d0d5dd] px-3" />
        <input required name="password" type="password" minLength={12} maxLength={128} placeholder="至少 12 位密码" className="h-10 rounded-md border border-[#d0d5dd] px-3" />
        <select name="role" className="h-10 rounded-md border border-[#d0d5dd] px-3"><option value="OPERATOR">OPERATOR</option><option value="OWNER">OWNER</option></select>
        <button className="h-10 rounded-md bg-[#175cd3] px-4 text-sm text-white">新增管理员</button>
      </form>
      {setup ? <div className="grid gap-4 rounded-md border border-[#fdb022] bg-[#fffaeb] p-4 sm:grid-cols-[220px_1fr]"><Image unoptimized width={220} height={220} src={setup.qr} alt="TOTP 绑定二维码" /><div><p className="font-semibold">一次性恢复码</p><pre className="mt-2 whitespace-pre-wrap font-mono text-sm">{setup.recoveryCodes.join("\n")}</pre><button className="mt-3 rounded-md border border-[#d0d5dd] bg-white px-3 py-2 text-sm" onClick={() => setSetup(null)}>我已妥善保存</button></div></div> : null}
      <div className="overflow-x-auto rounded-md border border-[#dfe4ea] bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#f9fafb] text-[#667085]"><tr><th className="px-4 py-3">账号</th><th>最近登录</th><th>权限与状态</th></tr></thead><tbody className="divide-y divide-[#eaecf0]">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium">{row.account}</td><td>{row.lastLoginAt ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.lastLoginAt)) : "从未登录"}</td><td><form className="flex gap-2 py-2" onSubmit={(event) => { event.preventDefault(); void updateAdmin(row, event.currentTarget); }}><select name="role" defaultValue={row.role} className="h-9 rounded-md border border-[#d0d5dd] px-2"><option>OWNER</option><option>OPERATOR</option></select><select name="status" defaultValue={row.status} className="h-9 rounded-md border border-[#d0d5dd] px-2"><option value="active">启用</option><option value="disabled">停用</option></select><button className="h-9 rounded-md border border-[#d0d5dd] px-3">保存</button></form></td></tr>)}</tbody></table></div>
    </div>
  );
}
