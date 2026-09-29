import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { getCurrentAdmin } from "@/lib/admin/session";

export default async function AdminLoginPage() {
  if (await getCurrentAdmin()) redirect("/admin");
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] p-4 text-[#172033]"><section className="w-full max-w-md rounded-md border border-[#dfe4ea] bg-white p-6 shadow-sm"><h1 className="text-xl font-semibold">运营后台登录</h1><p className="mb-6 mt-1 text-sm text-[#667085]">管理员账号必须使用独立密码和双重验证。</p><AdminLoginForm /></section></main>;
}
