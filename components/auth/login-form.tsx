"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dangerMessageClassName, Field, inputClassName } from "@/components/ui";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";

type ApiResult =
  | { success: true; data: unknown }
  | { success: false; error: { message: string } };

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: formData.get("account"),
          password: formData.get("password")
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
      setError("登录失败，请稍后再试");
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
          placeholder="请输入账号"
          required
        />
      </Field>
      <Field label="密码">
        <input
          autoComplete="current-password"
          className={inputClassName}
          name="password"
          placeholder="请输入密码"
          required
          type="password"
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
            登录中...
          </AnimatedShinyText>
        ) : (
          "登录"
        )}
      </button>
    </form>
  );
}
