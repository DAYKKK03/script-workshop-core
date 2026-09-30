import { AdminShell } from "@/components/admin/admin-shell";
import { InvitesPanel } from "@/components/admin/invites-panel";
import { requireAdmin } from "@/lib/admin/session";
import { prisma } from "@/lib/prisma";

export default async function AdminInvitesPage() { const admin = await requireAdmin(); const [groups, rows] = await Promise.all([prisma.inviteCode.groupBy({ by: ["status"], _count: { _all: true } }), prisma.inviteCode.findMany({ select: { code: true, status: true, createdAt: true, usedAt: true }, orderBy: { createdAt: "desc" }, take: 200 })]); const counts = Object.fromEntries(groups.map((row) => [row.status, row._count._all])); const codes = rows.map((row) => ({ ...row, code: row.code.length > 8 ? `${row.code.slice(0,4)}****${row.code.slice(-4)}` : "****" })); return <AdminShell admin={admin}><div className="space-y-6"><div><h1 className="text-2xl font-semibold">邀请码</h1><p className="mt-1 text-sm text-[#667085]">完整邀请码仅在生成时显示一次。</p></div><InvitesPanel codes={codes} counts={counts} /></div></AdminShell>; }
