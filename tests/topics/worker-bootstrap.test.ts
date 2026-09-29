import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));

function runOutsideNext(modulePath: string) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", `import(${JSON.stringify(modulePath)})`],
    {
      cwd: root,
      encoding: "utf8",
      // The full test suite installs a shim for server-only. A standalone
      // Worker must prove its own import graph does not depend on that shim.
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        DATABASE_URL: "postgresql://app:test@127.0.0.1:1/unreachable"
      }
    }
  );
}

test("Topic Worker bootstrap loads outside Next without the server-only sentinel", () => {
  const result = runOutsideNext("./lib/topics/worker.ts");
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /This module cannot be imported from a Client Component/);
});

test("standard npm test runs guarded integration helpers in the test runtime", () => {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const environment: Record<string, string | undefined> = { ...process.env };
  delete environment.NODE_ENV;
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(
    npm,
    ["run", "test:runtime-probe"],
    {
      cwd: root,
      encoding: "utf8",
      // Node marks an active test runner in this internal variable. A fresh
      // npm process must not inherit that marker and skip its target file.
      env: environment as NodeJS.ProcessEnv,
      timeout: 120_000
    }
  );

  assert.equal(result.error, undefined, result.error?.message);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /# tests 1\n/u);
});
