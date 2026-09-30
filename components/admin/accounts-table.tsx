"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AccountRow = {
  id: string;
  account: string;
  status: "active" | "disabled";
  dailyScriptLimit: number;
  dailyTopicLimit: number;
  today: Usage;
  sevenDays: Usage;
  thirtyDays: Usage;
};
type Usage = { scripts: number; topics: number; deepseekTokens: number; tikhubRequests: number; asrSeconds: number; costMicros: number };

export function AccountsTable({ rows, canEdit }: { rows: AccountRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [totpCode, setTotpCode] = useState("");
  const [message, setMessage] = useState("");

  async function update(row: AccountRow, form: HTMLFormElement, revokeSessions = false) {
    const values = new FormData(form);
    const response = await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: row.id,
        dailyScriptLimit: Number(values.get("dailyScriptLimit")),
        dailyTopicLimit: Number(values.get("dailyTopicLimit")),
        status: values.get("status"),
        totpCode,
        revokeSessions
      })
    });
    const payload = await response.json();
    setMessage(response.ok ? (revokeSessions ? "该账号现有登录已强制下线" : "账号配置已更新") : payload?.error?.message || "更新失败");
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <label className="block max-w-xs text-sm font-medium text-[#344054]">
          二次验证 TOTP
          <input value={totpCode} onChange={(event) => setTotpCode(event.target.value)} inputMode="numeric" maxLength={6} className="focus-ring mt-1.5 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3" />
        </label>
      ) : null}
      {message ? <p className="text-sm text-[#475467]">{message}</p> : null}
      <div className="overflow-x-auto rounded-md border border-[#dfe4ea] bg-white">
        <table className="min-w-[1080px] w-full text-left text-sm">
          <thead className="bg-[#f9fafb] text-xs text-[#667085]"><tr><Th>账号</Th><Th>今日</Th><Th>7 天</Th><Th>30 天</Th><Th>API 用量（30 天）</Th><Th>估算费用</Th><Th>状态/额度</Th></tr></thead>
          <tbody className="divide-y divide-[#eaecf0]">
            {rows.map((row) => (
              <tr key={row.id}>
                <Td><span className="font-medium">{row.account}</span></Td>
                <Td>{row.today.scripts} 脚本 / {row.today.topics} 选题</Td><Td>{row.sevenDays.scripts} 脚本 / {row.sevenDays.topics} 选题</Td><Td>{row.thirtyDays.scripts} 脚本 / {row.thirtyDays.topics} 选题</Td>
                <Td>{row.thirtyDays.deepseekTokens.toLocaleString()} tokens / {row.thirtyDays.tikhubRequests} 次 / {row.thirtyDays.asrSeconds}s</Td>
                <Td>¥{(row.thirtyDays.costMicros / 1_000_000).toFixed(4)}</Td>
                <Td>
                  {canEdit ? (
                    <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void update(row, event.currentTarget); }}>
                      <select name="status" defaultValue={row.status} className="h-9 rounded-md border border-[#d0d5dd] px-2"><option value="active">启用</option><option value="disabled">停用</option></select>
                      <input name="dailyScriptLimit" type="number" min={0} max={1000} defaultValue={row.dailyScriptLimit} className="h-9 w-20 rounded-md border border-[#d0d5dd] px-2" aria-label="每日脚本额度" />
                      <input name="dailyTopicLimit" type="number" min={0} max={1000} defaultValue={row.dailyTopicLimit} className="h-9 w-20 rounded-md border border-[#d0d5dd] px-2" aria-label="每日选题额度" />
                      <button className="h-9 rounded-md border border-[#d0d5dd] px-3 hover:bg-[#f2f4f7]">保存</button>
                      <button type="button" onClick={(event) => void update(row, event.currentTarget.form!, true)} className="h-9 rounded-md border border-[#d0d5dd] px-3 hover:bg-[#f2f4f7]">下线</button>
                    </form>
                  ) : <span>{row.status === "active" ? "启用" : "停用"} · 脚本 {row.dailyScriptLimit}/日 · 选题 {row.dailyTopicLimit}/日</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-4 py-3 font-medium">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-4 py-3 text-[#344054]">{children}</td>; }
