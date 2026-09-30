import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminExtractionJobs } from "@/lib/admin/extraction-jobs";
import { requireAdmin } from "@/lib/admin/session";

const formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  dateStyle: "medium",
  timeStyle: "short"
});

export default async function AdminExtractionJobsPage() {
  const admin = await requireAdmin(["OWNER"]);
  const rows = await getAdminExtractionJobs();

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">提取任务</h1>
          <p className="mt-1 text-sm text-[#667085]">
            这里只显示已经进入后端队列的提取任务。若前端输入里没有解析出完整抖音链接，不会生成任务记录。
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border border-[#dfe4ea] bg-white">
          <table className="w-full min-w-[1520px] text-left text-sm">
            <thead className="bg-[#f9fafb] text-[#667085]">
              <tr>
                <th className="px-4 py-3">任务</th>
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">项目</th>
                <th className="px-4 py-3">来源</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">错误码</th>
                <th className="px-4 py-3">细分原因</th>
                <th className="px-4 py-3">已选媒体</th>
                <th className="px-4 py-3">候选摘要</th>
                <th className="px-4 py-3">尝试</th>
                <th className="px-4 py-3">transcript</th>
                <th className="px-4 py-3">创建</th>
                <th className="px-4 py-3">更新</th>
                <th className="px-4 py-3">可执行</th>
                <th className="px-4 py-3">锁定</th>
                <th className="px-4 py-3">过期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eaecf0]">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-[#667085]" colSpan={16}>
                    暂无后端提取任务记录。
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.jobHash8}>
                    <td className="px-4 py-3 font-mono text-xs text-[#344054]">{row.jobHash8}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#344054]">{row.userHash8}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#344054]">{row.projectHash8 || "-"}</td>
                    <td className="px-4 py-3 text-[#344054]">
                      <div>{row.sourceHost || "-"}</div>
                      <div className="font-mono text-xs text-[#98a2b3]">{row.sourceHash || "-"}</div>
                    </td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#344054]">{row.errorCode || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#344054]">{row.failureReason || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#344054]">{row.selectedMediaSummary || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#344054]">{row.candidateSummary || "-"}</td>
                    <td className="px-4 py-3">{row.attemptSummary}</td>
                    <td className="px-4 py-3">{row.transcriptState}</td>
                    <td className="px-4 py-3 text-[#475467]">{formatter.format(row.createdAt)}</td>
                    <td className="px-4 py-3 text-[#475467]">{formatter.format(row.updatedAt)}</td>
                    <td className="px-4 py-3 text-[#475467]">{formatter.format(row.availableAt)}</td>
                    <td className="px-4 py-3 text-[#475467]">{row.lockedAt ? formatter.format(row.lockedAt) : "-"}</td>
                    <td className="px-4 py-3 text-[#475467]">{row.expiresAt ? formatter.format(row.expiresAt) : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
