import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProjectFile(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("custom scripts page is authenticated and exposes only project identity to the client", async () => {
  const page = await readProjectFile("app/custom-scripts/page.tsx");

  assert.match(page, /requireUser\(\)/);
  assert.match(page, /listProjects\(user\.id\)/);
  assert.match(page, /id: project\.id/);
  assert.match(page, /projectName: project\.projectName/);
  assert.doesNotMatch(page, /profileText|updatedAtLabel|project\.updatedAt/);
  assert.match(page, /请先创建商家项目并填写资料/);
  assert.match(page, /href="\/projects\/new"/);
});

test("real route uses the durable generation service without fake results", async () => {
  const [page, workbench, preview, jobHook] = await Promise.all([
    readProjectFile("app/custom-scripts/page.tsx"),
    readProjectFile("components/custom-scripts/custom-script-workbench.tsx"),
    readProjectFile("app/custom-scripts/preview/page.tsx"),
    readProjectFile("components/custom-scripts/use-custom-script-job.ts")
  ]);

  assert.match(page, /<CustomScriptWorkbench projects=\{options\} defaultProjectId=\{options\[0\]\.id\} \/>/);
  assert.doesNotMatch(page, /previewMode|initialResult|onGenerate/);
  assert.match(workbench, /const canSubmit = !previewMode/);
  assert.match(workbench, /disabled=\{!canSubmit\}/);
  assert.doesNotMatch(workbench, /生成服务将在下一阶段接入|onGenerate/);
  assert.match(jobHook, /\/api\/scripts\/generate-custom\/current/);
  assert.match(jobHook, /crypto\.randomUUID\(\)/);
  assert.match(jobHook, /setInterval/);
  assert.match(jobHook, /method: "DELETE"/);
  assert.match(jobHook, /previousScript/);
  assert.match(jobHook, /pendingRequestRef/);
  assert.match(jobHook, /lastAcceptedRequestRef/);
  assert.match(jobHook, /createExplicitRetryCustomScriptRequest/);
  assert.match(workbench, /onRetryRegeneration/);
  assert.doesNotMatch(page, /小岛西点烘焙|customScriptPreviewRequest/);
  assert.match(preview, /固定样本，不调用AI、不保存结果/);
});

test("preview route returns not found in production and supports fixed query states", async () => {
  const preview = await readProjectFile("app/custom-scripts/preview/page.tsx");

  assert.match(preview, /isCustomScriptPreviewEnabled\(process\.env\.NODE_ENV\)/);
  assert.match(preview, /notFound\(\)/);
  assert.match(preview, /state=\$\{previewState\}/);
  assert.match(preview, /previewMode/);
});

test("workbench contains all required controls and clears stale results", async () => {
  const [page, preview, workbench, options, panel] = await Promise.all([
    readProjectFile("app/custom-scripts/page.tsx"),
    readProjectFile("app/custom-scripts/preview/page.tsx"),
    readProjectFile("components/custom-scripts/custom-script-workbench.tsx"),
    readProjectFile("components/custom-scripts/custom-script-types.ts"),
    readProjectFile("components/custom-scripts/custom-script-result-panel.tsx")
  ]);

  assert.doesNotMatch(`${page}\n${preview}\n${workbench}\n${options}\n${panel}`, /maxLength\s*=|maxlength\s*=/i);
  assert.match(workbench, /\{requestLength\}\/5000/);
  assert.match(workbench, /countNormalizedCustomScriptCodePoints\(requestText\)/);
  assert.match(workbench, /requestLength > 5000/);
  assert.match(workbench, /const canSubmit = !previewMode && !validationMessage && !sourceMismatch && !job\.processing/);
  for (const label of ["商家项目", "你想生成什么脚本", "内容目标", "表达风格"]) {
    assert.match(workbench, new RegExp(label));
  }
  for (const value of ["auto", "traffic", "trust", "conversion"]) {
    assert.match(options, new RegExp(`value: "${value}"`));
  }
  for (const value of ["natural", "professional", "emotional"]) {
    assert.match(options, new RegExp(`value: "${value}"`));
  }
  assert.match(workbench, /function clearResult\(\)/);
  assert.ok((workbench.match(/clearResult\(\)/g) ?? []).length >= 5);
  assert.match(workbench, /sourceProjectId !== projectId/);
});

test("result panel covers required states, actions, and temporary-result warning", async () => {
  const panel = await readProjectFile("components/custom-scripts/custom-script-result-panel.tsx");

  for (const status of ["processing", "success", "needs_profile", "failed", "canceled"]) {
    assert.match(panel, new RegExp(`result\\.status === "${status}"`));
  }
  for (const label of ["取消生成", "复制完整脚本", "换一版", "重试换一版", "结果仅临时保留30分钟且不进入历史"]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /aria-readonly="true"/);
  assert.match(panel, /navigator\.clipboard\.writeText/);
  assert.match(panel, /复制失败，请允许浏览器访问剪贴板后重试/);
  assert.match(panel, /刷新后原生成条件已清理/);
  assert.match(panel, /目标约200—350字，实际以完整口播为准/);
  assert.doesNotMatch(panel, /disabled=\{!onRegenerate\}/);
  assert.doesNotMatch(panel, /标题|分镜|时间轴|AI 推理/);
});

test("custom scripts UI is mobile-first with accessible touch and alert states", async () => {
  const [workbench, options, panel] = await Promise.all([
    readProjectFile("components/custom-scripts/custom-script-workbench.tsx"),
    readProjectFile("components/custom-scripts/segmented-options.tsx"),
    readProjectFile("components/custom-scripts/custom-script-result-panel.tsx")
  ]);
  const source = `${workbench}\n${options}\n${panel}`;

  assert.match(source, /min-h-11/);
  assert.match(source, /w-full px-6 sm:w-auto/);
  assert.match(options, /grid-cols-2 gap-2 sm:grid-cols-4/);
  assert.match(workbench, /xl:grid-cols-2/);
  assert.match(source, /role="alert"/);
  assert.match(source, /focus-ring|focus-visible/);
});

test("custom script motion stops under reduced-motion preference", async () => {
  const [styles, workbench, result] = await Promise.all([
    readProjectFile("app/globals.css"),
    readProjectFile("components/custom-scripts/custom-script-workbench.tsx"),
    readProjectFile("components/custom-scripts/custom-script-result-panel.tsx")
  ]);

  assert.match(`${workbench}\n${result}`, /custom-script-spinner/);
  assert.match(`${workbench}\n${result}`, /custom-script-motion/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.custom-script-spinner[\s\S]*animation: none/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.custom-script-motion[\s\S]*transition: none/);
});
