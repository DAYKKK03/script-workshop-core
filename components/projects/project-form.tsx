"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dangerMessageClassName, Field, inputClassName } from "@/components/ui";

type ApiResult =
  | { success: true; data: { project?: { id: string } } }
  | { success: false; error: { message: string } };

type ProjectFormProps = {
  mode: "create" | "edit";
  projectId?: string;
  initialProjectName?: string;
  initialProfileText?: string;
};

export function ProjectForm({
  mode,
  projectId,
  initialProjectName = "",
  initialProfileText = ""
}: ProjectFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const url = mode === "create" ? "/api/projects" : `/api/projects/${projectId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: formData.get("projectName"),
          profileText: formData.get("profileText")
        })
      });
      const result = (await response.json()) as ApiResult;

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      router.push("/projects");
      router.refresh();
    } catch {
      setError("项目保存失败，请稍后再试");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!projectId) {
      return;
    }

    setError("");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE"
      });
      const result = (await response.json()) as ApiResult;

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      router.push("/projects");
      router.refresh();
    } catch {
      setError("项目删除失败，请稍后再试");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Field label="项目名称">
        <input
          className={inputClassName}
          defaultValue={initialProjectName}
          name="projectName"
          placeholder="例如：巷口牛肉面"
          required
        />
      </Field>
      <Field label="店铺资料">
        <textarea
          className={`${inputClassName} min-h-72 resize-y leading-6`}
          defaultValue={initialProfileText}
          name="profileText"
          placeholder="建议写入店铺名字、位置、主营内容、店铺特点、菜品特色、当前活动和其他补充信息。"
          required
        />
      </Field>
      {error ? (
        <p className={dangerMessageClassName}>{error}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          className="focus-ring orange-gradient rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(217,95,19,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || isDeleting}
          type="submit"
        >
          {isSubmitting ? "保存中..." : mode === "create" ? "保存项目" : "保存修改"}
        </button>
        <a
          className="focus-ring rounded-md border border-white/15 bg-white/8 px-4 py-2.5 text-sm font-semibold text-[#f8fafc] transition hover:border-[#ffb14a]/35 hover:bg-white/12"
          href="/projects"
        >
          返回列表
        </a>
        {mode === "edit" ? (
          <button
            className="focus-ring rounded-md border border-[#ff6b5f]/35 bg-[#ff6b5f]/10 px-4 py-2.5 text-sm font-semibold text-[#ffd3ce] transition hover:bg-[#ff6b5f]/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || isDeleting}
            onClick={handleDelete}
            type="button"
          >
            {isDeleting ? "删除中..." : "删除项目"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
