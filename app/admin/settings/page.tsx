import { AdminShell } from "@/components/admin/admin-shell";
import { CostSettingsForm } from "@/components/admin/cost-settings-form";
import { requireAdmin } from "@/lib/admin/session";
import { getConfiguredProviderPrices } from "@/lib/usage/service";

export default async function SettingsPage() { const admin = await requireAdmin(["OWNER"]); const prices = await getConfiguredProviderPrices(); return <AdminShell admin={admin}><div className="space-y-6"><div><h1 className="text-2xl font-semibold">成本配置</h1><p className="mt-1 text-sm text-[#667085]">用于后台人民币费用估算，不替代供应商账单。</p></div><CostSettingsForm prices={prices} /></div></AdminShell>; }
