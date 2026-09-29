"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      className="focus-ring w-full rounded-md border border-white/15 bg-white/8 px-3 py-2 text-sm font-medium text-[#cbd5e1] transition hover:border-[#ffb14a]/35 hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isSubmitting}
      onClick={handleLogout}
      type="button"
    >
      {isSubmitting ? "退出中..." : "退出登录"}
    </button>
  );
}
