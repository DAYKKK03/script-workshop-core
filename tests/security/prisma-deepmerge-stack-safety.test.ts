import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";

const requireFromPrismaConfig = createRequire(require.resolve("@prisma/config/package.json"));

function minimalChildEnvironment(): NodeJS.ProcessEnv {
  const environment = {} as NodeJS.ProcessEnv;

  for (const name of ["PATH", "HOME", "TMPDIR", "TMP", "TEMP"] as const) {
    if (process.env[name]) {
      environment[name] = process.env[name];
    }
  }

  return environment;
}

test("Prisma config resolves a bounded deepmerge implementation for recursive input", () => {
  // Keep the recursive input out of the test runner: an unpatched dependency can exhaust
  // the child stack, and the timeout makes a future non-terminating regression bounded.
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      [
        'const { createRequire } = require("node:module");',
        'const requireFromPrismaConfig = createRequire(require.resolve("@prisma/config/package.json"));',
        'const { deepmerge } = requireFromPrismaConfig("deepmerge-ts");',
        "const recursive = {};",
        "recursive.self = recursive;",
        "deepmerge(recursive, recursive);",
        'process.stdout.write("completed\\n");',
      ].join(""),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: minimalChildEnvironment(),
      timeout: 2_000,
    },
  );

  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0);
  assert.equal(child.stdout, "completed\n");
  assert.equal(child.stderr, "");

  const packageJson = JSON.parse(
    readFileSync(join(dirname(requireFromPrismaConfig.resolve("deepmerge-ts")), "..", "package.json"), "utf8"),
  ) as { version: string };
  assert.equal(packageJson.version, "8.0.2");
});
