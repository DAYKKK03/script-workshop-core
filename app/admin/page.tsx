import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { UsageChart } from "@/components/admin/usage-chart";
import { getAdminOverview } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/admin/session";

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdmin();
  const value = Number((await searchParams).days || 30);
  const days = [7, 30, 90].includes(value) ? value : 30;
  const data = await getAdminOverview(days);
  const today = data.today as Record<string, number>;
  return <AdminShell admin={admin}><div className="space-y-6"><div><h1 className="text-2xl font-semibold">运营总览</h1><p className="mt-1 text-sm text-[#667085]">统计时区：Asia/Shanghai</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><Metric label="今日成功脚本" value={today.scriptsGenerated || 0} /><Metric label="今日选题生成" value={today.topicIdeasGenerated || 0} /><Metric label="今日 API 请求" value={(today.deepseekRequests || 0) + (today.tikhubRequests || 0) + (today.asrJobs || 0)} /><Metric label="今日估算费用" value={`¥${((today.estimatedCostMicros || 0) / 1_000_000).toFixed(4)}`} /><Metric label="今日活跃账号" value={data.activeAccounts} /><Metric label="剩余邀请码" value={(data.invites.unused as number) || 0} /><Metric label="队列待处理" value={(data.queue.queued as number) || 0} /></div><section className="rounded-md border border-[#dfe4ea] bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">成功脚本趋势</h2><div className="flex gap-1">{[7,30,90].map((item) => <Link key={item} href={`/admin?days=${item}`} className={`rounded-md px-3 py-1.5 text-sm ${days === item ? "bg-[#175cd3] text-white" : "bg-[#f2f4f7] text-[#475467]"}`}>{item} 天</Link>)}</div></div><UsageChart data={data.trend as Array<{ date: string; scriptsGenerated: number }>} /></section></div></AdminShell>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-md border border-[#dfe4ea] bg-white p-4"><p className="text-sm text-[#667085]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
