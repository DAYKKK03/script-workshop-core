"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function AdminLogoutButton() {
  const router = useRouter();
  return (
    <button
      className="focus-ring inline-flex size-9 items-center justify-center rounded-md border border-[#d0d5dd] bg-white text-[#475467] hover:bg-[#f2f4f7]"
      title="退出后台"
      onClick={async () => {
        await fetch("/api/admin/auth/logout", { method: "POST" });
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      <LogOut size={17} />
    </button>
  );
}
