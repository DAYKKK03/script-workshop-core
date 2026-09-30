import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const credentialForms = [
  "components/auth/login-form.tsx",
  "components/auth/register-form.tsx",
  "components/admin/admin-login-form.tsx"
];

test("credential forms fall back to POST instead of exposing fields in query strings", async () => {
  for (const path of credentialForms) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.match(source, /<form[\s\S]*?method="post"[\s\S]*?>/);
  }
});
