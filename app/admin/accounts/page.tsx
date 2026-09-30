import { AccountsTable } from "@/components/admin/accounts-table";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAccountUsage } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/admin/session";

export default async function AdminAccountsPage() { const admin = await requireAdmin(); const rows = await getAccountUsage(); return <AdminShell admin={admin}><div className="space-y-6"><div><h1 className="text-2xl font-semibold">账号数据</h1><p className="mt-1 text-sm text-[#667085]">查看每个账号的脚本产量、API 用量与估算费用。</p></div><AccountsTable rows={rows} canEdit={admin.role === "OWNER"} /></div></AdminShell>; }
