import Link from "next/link";
import type { ReactNode } from "react";
import type { CurrentAdmin } from "@/lib/admin/session";
import { AdminLogoutButton } from "@/components/admin/logout-button";

export function AdminShell({ admin, children }: { admin: CurrentAdmin; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f7fa] text-[#172033]">
      <header className="border-b border-[#dfe4ea] bg-white">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">短视频脚本运营后台</p>
            <p className="truncate text-xs text-[#667085]">{admin.account} · {admin.role}</p>
          </div>
          <AdminLogoutButton />
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto border-b border-[#dfe4ea] bg-white p-3 md:min-h-[calc(100vh-65px)] md:flex-col md:border-b-0 md:border-r">
          <NavLink href="/admin">总览</NavLink>
          <NavLink href="/admin/accounts">账号数据</NavLink>
          <NavLink href="/admin/invites">邀请码</NavLink>
          {admin.role === "OWNER" ? <NavLink href="/admin/admins">管理员</NavLink> : null}
          {admin.role === "OWNER" ? <NavLink href="/admin/extraction-jobs">提取任务</NavLink> : null}
          {admin.role === "OWNER" ? <NavLink href="/admin/settings">成本配置</NavLink> : null}
          {admin.role === "OWNER" ? <NavLink href="/admin/audit">审计日志</NavLink> : null}
        </nav>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-[#344054] hover:bg-[#eef2f6]" href={href}>{children}</Link>;
}
