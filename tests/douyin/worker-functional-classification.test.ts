import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  classifyExtractionWorkerVerificationFailure,
  extractionWorkerVerificationFailureCodes
} from "../../worker/verify-functional-classification";

const expectedCodes = [
  "probe_setup_failed", "probe_timed_out", "terminal_status_mismatch", "terminal_error_code_mismatch",
  "attempt_count_mismatch", "lease_not_released", "probe_cleanup_failed", "database_error"
] as const;

test("maps extraction worker verifier failures to the fixed safe allowlist", () => {
  assert.deepEqual(extractionWorkerVerificationFailureCodes, expectedCodes);
  for (const code of expectedCodes) {
    assert.equal(classifyExtractionWorkerVerificationFailure(code), code);
  }
});

test("classification module imports without database or Provider runtime configuration", () => {
  const originalTikHub = process.env.TIKHUB_API_KEY;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.TIKHUB_API_KEY = "parent-tikhub-sentinel";
  process.env.DATABASE_URL = "parent-database-sentinel";
  try {
    const environment: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      NODE_PATH: process.env.NODE_PATH
    };
    const result = spawnSync(process.execPath, ["--import", "tsx", "-e", 'import("./worker/verify-functional-classification.ts")'], {
      cwd: process.cwd(), encoding: "utf8", env: environment as NodeJS.ProcessEnv
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.doesNotMatch(output, /parent-tikhub-sentinel|parent-database-sentinel/u);
  } finally {
    process.env.TIKHUB_API_KEY = originalTikHub;
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("maps unknown verifier errors to database_error without returning untrusted details", () => {
  const unsafe = new Error("postgresql://private.example.test/jobs/probe-123 stack-detail");
  const output = classifyExtractionWorkerVerificationFailure(unsafe);
  assert.equal(output, "database_error");
  assert.doesNotMatch(output, /private|probe-123|stack|postgresql/u);
});
