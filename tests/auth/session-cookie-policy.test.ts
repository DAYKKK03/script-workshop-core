import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function read(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("session cookies stay secure unless explicitly disabled", async () => {
  const policy = await import("../../lib/auth/session-cookie-policy.ts").catch(
    () => ({ shouldUseSecureSessionCookies: undefined })
  );

  assert.equal(typeof policy.shouldUseSecureSessionCookies, "function");
  assert.equal(policy.shouldUseSecureSessionCookies?.(undefined), true);
  assert.equal(policy.shouldUseSecureSessionCookies?.(""), true);
  assert.equal(policy.shouldUseSecureSessionCookies?.("true"), true);
  assert.equal(policy.shouldUseSecureSessionCookies?.("false"), false);
  assert.equal(policy.shouldUseSecureSessionCookies?.("FALSE"), true);
  assert.equal(policy.shouldUseSecureSessionCookies?.("0"), true);
  assert.equal(policy.shouldUseSecureSessionCookies?.("invalid"), true);
});

test("administrator and user sessions share the same cookie security policy", async () => {
  for (const path of ["lib/admin/session.ts", "lib/auth/session.ts"]) {
    const source = await read(path);
    assert.match(source, /shouldUseSecureSessionCookies/);
    assert.doesNotMatch(source, /secure:\s*process\.env\.NODE_ENV/);
  }
});

test("administrator and user session cookie options follow the explicit server toggle", async () => {
  for (const scenario of [
    { value: "false", expected: false },
    { value: "true", expected: true },
    { value: "invalid", expected: true }
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--eval",
        [
          "import * as authSession from './lib/auth/session.ts';",
          "import * as adminSession from './lib/admin/session.ts';",
          "process.stdout.write(JSON.stringify({",
          "user: authSession.default.sessionCookieOptions.secure,",
          "admin: adminSession.default.adminSessionCookieOptions.secure",
          "}));"
        ].join("")
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, SESSION_COOKIE_SECURE: scenario.value }
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { user: boolean; admin: boolean };
    assert.equal(output.user, scenario.expected);
    assert.equal(output.admin, scenario.expected);
  }
});

test("login, registration, and logout use shared session cookie options", async () => {
  const userLogout = await read("app/api/auth/logout/route.ts");
  const adminLogout = await read("app/api/admin/auth/logout/route.ts");

  assert.match(userLogout, /sessionCookieOptions/);
  assert.match(adminLogout, /adminSessionCookieOptions/);
  assert.doesNotMatch(userLogout, /secure:\s*process\.env\.NODE_ENV/);
  assert.doesNotMatch(adminLogout, /cookies\.set\([\s\S]*\{\s*httpOnly:/);
});

test(".env.example documents the explicit session cookie security toggle", async () => {
  const envExample = await read(".env.example");

  assert.match(envExample, /SESSION_COOKIE_SECURE=""/);
});
