"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dangerMessageClassName, Field, inputClassName } from "@/components/ui";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";

type ApiResult =
  | { success: true; data: unknown }
  | { success: false; error: { message: string } };

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: formData.get("account"),
          password: formData.get("password"),
          inviteCode: formData.get("inviteCode")
        })
      });
      const result = (await response.json()) as ApiResult;

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      router.push("/generate");
      router.refresh();
    } catch {
      setError("注册失败，请稍后再试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" method="post" onSubmit={handleSubmit}>
      <Field label="账号">
        <input
          autoComplete="username"
          className={inputClassName}
          name="account"
          placeholder="设置登录账号"
          required
        />
      </Field>
      <Field label="密码">
        <input
          autoComplete="new-password"
          className={inputClassName}
          minLength={10}
          name="password"
          placeholder="设置登录密码，至少 10 位"
          required
          type="password"
        />
      </Field>
      <Field label="邀请码">
        <input
          className={inputClassName}
          name="inviteCode"
          placeholder="请输入邀请码"
          required
        />
      </Field>
      {error ? (
        <p className={dangerMessageClassName}>{error}</p>
      ) : null}
      <button
        className="login-submit-button focus-ring w-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? (
          <AnimatedShinyText className="max-w-none text-white">
            注册中...
          </AnimatedShinyText>
        ) : (
          "创建账号"
        )}
      </button>
    </form>
  );
}
