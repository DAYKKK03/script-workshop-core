"use client";

import Link from "next/link";
import {
  ChevronDown,
  Flame,
  LogOut,
  Menu,
  PenLine,
  Sparkles,
  Store,
  WandSparkles
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { ColorBends } from "@/components/visual/color-bends";

type AppShellProps = {
  children: React.ReactNode;
  active?: "projects" | "generate" | "topics" | "customScripts";
  account?: string;
};

const navItems = [
  { href: "/projects", label: "商家项目", key: "projects", Icon: Store },
  { href: "/generate", label: "脚本生成", key: "generate", Icon: WandSparkles },
  { href: "/topics", label: "爆款选题", key: "topics", Icon: Flame },
  { href: "/custom-scripts", label: "定制化脚本", key: "customScripts", Icon: PenLine }
] as const;

export function AppShell({ children, active, account }: AppShellProps) {
  return (
    <div className="app-background relative min-h-screen overflow-hidden">
      <ColorBends
        className="opacity-35"
        mouseInfluence={0.18}
        parallax={0.08}
        speed={0.06}
      />
      <div className="absolute inset-0 bg-[#030303]/48" />
      <div className="app-shell-flow-band left-[8%] top-[15%] h-20 w-[98%] rotate-[-16deg]" />
      <div className="app-shell-flow-band app-shell-flow-band-secondary bottom-[22%] left-[12%] h-24 w-[88%] rotate-[-15deg]" />
      <div className="app-shell-warm-glow right-[8%] top-[24%]" />
      <div className="relative z-10 flex min-h-screen">
        <aside className="glass-panel fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-7 rounded-none border-y-0 border-l-0 bg-[rgba(7,9,18,0.72)] p-5 lg:flex">
          <Link href="/generate" className="flex items-center gap-3">
            <span className="orange-gradient grid h-10 w-10 place-items-center rounded-lg text-sm font-bold text-white shadow-[0_12px_32px_rgba(217,95,19,0.25)]">
              <Sparkles size={19} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-xl font-bold text-[#f8fafc]">
                脚本工坊
              </span>
              <span className="block text-xs text-[#94a3b8]">短视频脚本拆写优化</span>
            </span>
          </Link>
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.Icon;

              return (
              <Link
                key={item.key}
                href={item.href}
                className={`relative flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                  active === item.key
                    ? "border-[#ffb14a]/28 bg-[linear-gradient(90deg,rgba(255,122,26,0.34),rgba(255,122,26,0.08))] text-white shadow-[inset_4px_0_0_#ff7a1a]"
                    : "border-transparent text-[#cbd5e1] hover:border-white/12 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon size={18} strokeWidth={2} />
                {item.label}
              </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-white/10 pt-4">
            {account ? (
              <p className="mb-3 truncate text-xs text-[#94a3b8]">
                当前账号：{account}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <LogOut size={15} className="text-[#94a3b8]" />
              <LogoutButton />
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
          <header className="glass-panel sticky top-0 z-10 flex h-16 items-center justify-between rounded-none border-x-0 border-t-0 px-5 lg:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-white/12 bg-white/8 text-[#f8fafc]">
                <Menu size={18} strokeWidth={2} />
              </span>
              <Link
                href="/generate"
                className="flex items-center gap-2 text-sm font-semibold text-[#f8fafc] lg:hidden"
              >
                <span className="orange-gradient grid h-8 w-8 place-items-center rounded-lg text-xs text-white">
                  <Sparkles size={15} />
                </span>
                脚本工坊
              </Link>
            </div>
            <div className="flex items-center gap-3">
              {account ? (
                <span className="inline-flex max-w-[220px] items-center gap-2 rounded-md border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-[#f8fafc]">
                  <span className="truncate">{account}</span>
                  <ChevronDown size={15} className="text-[#94a3b8]" />
                </span>
              ) : null}
            </div>
          </header>
          <main className="min-w-0 flex-1 px-4 py-7 lg:px-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
