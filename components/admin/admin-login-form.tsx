"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/admin/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            account: form.get("account"),
            password: form.get("password"),
            verificationCode: form.get("verificationCode")
          })
        });
        const payload = await response.json();
        setPending(false);
        if (!response.ok) {
          setError(payload?.error?.message || "登录失败");
          return;
        }
        router.replace("/admin");
        router.refresh();
      }}
    >
      <Field label="管理员账号" name="account" autoComplete="username" />
      <Field label="密码" name="password" type="password" autoComplete="current-password" />
      <Field label="6 位验证码或恢复码" name="verificationCode" autoComplete="one-time-code" />
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      <button disabled={pending} className="focus-ring h-10 w-full rounded-md bg-[#175cd3] px-4 text-sm font-medium text-white hover:bg-[#1849a9] disabled:opacity-50">
        {pending ? "验证中" : "登录后台"}
      </button>
    </form>
  );
}

function Field({ label, name, type = "text", autoComplete }: { label: string; name: string; type?: string; autoComplete?: string }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-[#344054]">
      <span>{label}</span>
      <input required name={name} type={type} autoComplete={autoComplete} className="focus-ring h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-[#101828]" />
    </label>
  );
}
