import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readRepositoryFile(filePath: string) {
  return readFile(path.join(process.cwd(), filePath), "utf8");
}

test("temporary bootstrap-admin API route is removed and bootstrap stays script-only", async () => {
  const routeCheck = spawnSync("/bin/sh", ["-lc", "test ! -f app/api/bootstrap-admin/route.ts"], {
    cwd: process.cwd()
  });
  assert.equal(routeCheck.status, 0, "temporary bootstrap-admin route must not exist");

  const bootstrapScript = await readRepositoryFile("scripts/bootstrap-admin.ts");
  assert.match(bootstrapScript, /BOOTSTRAP_ADMIN_OUTPUT_FILE/);
  assert.doesNotMatch(bootstrapScript, /const\s+password\s*=\s*["'`]/);
  assert.doesNotMatch(bootstrapScript, /const\s+totpSecret\s*=\s*["'`]/);
});

test("local deployment docs and work log redact real-looking secrets", async () => {
  const files = [
    "STAGING_DEPLOY_MANUAL.md",
    "docs/EDGEONE_DJYYING_ASIA_SETUP.md",
    "docs/EDGEONE_DIYYIING_ASIA_SETUP.md",
    "docs/EDGEONE_SETUP_GUIDE.md",
    "project-team/work-log.md"
  ];

  const forbiddenPatterns = [
    /POSTGRES_PASSWORD=(?!<|\"<|REDACTED|redacted|your-)[^\s`"]+/,
    /DATABASE_URL=postgresql:\/\/app:(?!<|%3C|your-)[^\s`"]+@/i,
    /SESSION_SECRET=(?!<|\"<|REDACTED|redacted|your-)[A-Za-z0-9._~+\/=-]{16,}/,
    /ADMIN_MFA_ENCRYPTION_KEY=(?!<|\"<|REDACTED|redacted|your-)[A-Za-z0-9._~+\/=-]{16,}/,
    /TIKHUB_API_KEY=(?!<|\"<|REDACTED|redacted|your-)[A-Za-z0-9._~+\/=-]{16,}/,
    /VOLCENGINE_ASR_API_KEY=(?!<|\"<|REDACTED|redacted|your-)(?:ark-|[A-Za-z0-9._~+\/=-]{16,})/i,
    /DEEPSEEK_API_KEY=(?!<|\"<|REDACTED|redacted|your-)(?:sk-|[A-Za-z0-9._~+\/=-]{16,})/i,
    /EDGEONE_ORIGIN_SECRET=(?!<|\"<|REDACTED|redacted|your-)[A-Za-z0-9._~+\/=-]{16,}/,
    /database password encoding issue \(`(?!<redacted-secret>`)[^`]+` needed URL encoding\)/i
  ];

  for (const file of files) {
    const content = await readRepositoryFile(file);
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(content, pattern, `${file} still contains sensitive material`);
    }
  }
});
