import { AdminShell } from "@/components/admin/admin-shell";
import { AdminsPanel } from "@/components/admin/admins-panel";
import { requireAdmin } from "@/lib/admin/session";
import { prisma } from "@/lib/prisma";

export default async function AdminsPage() { const admin = await requireAdmin(["OWNER"]); const rows = await prisma.adminUser.findMany({ select: { id: true, account: true, role: true, status: true, lastLoginAt: true }, orderBy: { createdAt: "desc" } }); return <AdminShell admin={admin}><div className="space-y-6"><div><h1 className="text-2xl font-semibold">管理员</h1><p className="mt-1 text-sm text-[#667085]">每位管理员必须使用独立账号并绑定 TOTP。</p></div><AdminsPanel rows={rows} /></div></AdminShell>; }
