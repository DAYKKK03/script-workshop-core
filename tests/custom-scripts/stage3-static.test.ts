import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("schema and migration persist the complete custom script lease contract", async () => {
  const [schema, migration] = await Promise.all([
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260714000100_add_custom_script_generation_jobs/migration.sql")
  ]);
  for (const field of [
    "inputHash", "clientRequestId", "providerCallsStarted", "semanticAttempt",
    "quotaChargedAt", "lockedBy", "lockedAt", "runDeadlineAt", "finishedAt", "expiresAt"
  ]) assert.match(schema, new RegExp(field));
  assert.match(schema, /enum CustomScriptGenerationJobStatus[\s\S]*needs_profile[\s\S]*canceled/);
  assert.match(migration, /CREATE UNIQUE INDEX[\s\S]*CustomScriptGenerationJob[\s\S]*userId[\s\S]*WHERE[\s\S]*queued[\s\S]*processing/i);
});

test("custom script APIs and worker use authenticated persistent jobs", async () => {
  const [create, current, item, worker, packageJson] = await Promise.all([
    read("app/api/scripts/generate-custom/route.ts"),
    read("app/api/scripts/generate-custom/current/route.ts"),
    read("app/api/scripts/generate-custom/[jobId]/route.ts"),
    read("worker/custom-script-worker.ts"),
    read("package.json")
  ]);
  for (const route of [create, current, item]) assert.match(route, /getCurrentUser\(\)/);
  assert.match(create, /createCustomScriptGenerationJob/);
  assert.match(current, /getCurrentCustomScriptGenerationJobForUser/);
  assert.match(item, /cancelCustomScriptGenerationJobForUser/);
  assert.match(worker, /verifyCustomScriptWorkerRuntime/);
  assert.match(packageJson, /worker:custom-scripts/);
});

test("formal page uses current recovery polling cancellation and regeneration", async () => {
  const [page, workbench, hook] = await Promise.all([
    read("app/custom-scripts/page.tsx"),
    read("components/custom-scripts/custom-script-workbench.tsx"),
    read("components/custom-scripts/use-custom-script-job.ts")
  ]);
  const client = `${workbench}\n${hook}`;
  assert.match(page, /CustomScriptWorkbench/);
  for (const token of [
    "/api/scripts/generate-custom/current",
    "crypto.randomUUID()",
    "previousScript",
    "DELETE",
    "setInterval"
  ]) assert.match(client, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(page, /previewMode|initialResult/);
});

test("custom script provider disables thinking and all nested retries", async () => {
  const [service, deepseek] = await Promise.all([
    read("lib/custom-scripts/service-runtime.ts"),
    read("lib/ai/deepseek-runtime.ts")
  ]);
  assert.match(service, /thinkingMode:\s*"disabled"/);
  assert.match(service, /maxAttempts:\s*1/);
  assert.match(service, /allowEnvelopeRetry:\s*false/);
  assert.match(deepseek, /allowEnvelopeRetry/);
});

test("completion outcomes distinguish success daily quota and lost lease", async () => {
  const [jobs, runner] = await Promise.all([
    read("lib/custom-scripts/jobs.ts"),
    read("lib/custom-scripts/job-runner.ts")
  ]);
  for (const outcome of ["completed", "daily_limit", "lease_lost"]) {
    assert.match(jobs, new RegExp(`"${outcome}"`));
  }
  assert.match(runner, /CUSTOM_SCRIPT_DAILY_LIMIT_REACHED/);
  assert.match(runner, /CUSTOM_SCRIPT_COMPLETION_LOST/);
  assert.match(jobs, /function terminalData[\s\S]*projectId:\s*null[\s\S]*input:\s*Prisma\.DbNull/);
});

test("quality fallback is durable, private, recoverable, and never sent to the provider", async () => {
  const [fallback, jobs, runner, worker, policy] = await Promise.all([
    read("lib/custom-scripts/quality-fallback.ts"),
    read("lib/custom-scripts/jobs.ts"),
    read("lib/custom-scripts/job-runner.ts"),
    read("lib/custom-scripts/worker.ts"),
    read("lib/custom-scripts/job-policy.ts")
  ]);
  assert.match(fallback, /status:\s*"quality_fallback"/);
  assert.match(fallback, /characterCount/);
  assert.match(jobs, /persistCustomScriptQualityFallback[\s\S]*providerCallsStarted:\s*1/);
  assert.match(jobs, /function parseStoredCustomScriptPublicResult[\s\S]*candidate\.status === "success"[\s\S]*candidate\.status === "needs_profile"/);
  assert.doesNotMatch(jobs.match(/function parseStoredCustomScriptPublicResult[\s\S]*?return undefined;\n}/)?.[0] || "", /quality_fallback/);
  assert.match(runner, /parseCustomScriptQualityFallback\(job\.result\)/);
  assert.match(runner, /persistCustomScriptQualityFallback/);
  assert.match(runner, /quality_enrichment/);
  assert.doesNotMatch(runner, /validatedDraft|firstSafeDraft/);
  assert.match(worker, /providerCallsStarted:\s*hasQualityFallback[\s\S]*lte:/);
  assert.match(worker, /hasRecoverableFallback[\s\S]*!hasRecoverableFallback/);
  assert.match(policy, /CUSTOM_SCRIPT_QUALITY_LEASE_RECOVERY_MS/);
  assert.match(policy, /CUSTOM_SCRIPT_QUALITY_REQUIRED_REMAINING_MS/);
});
