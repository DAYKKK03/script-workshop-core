import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readRoute(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("user and administrator logout routes use no-store API responses", async () => {
  for (const path of [
    "app/api/auth/logout/route.ts",
    "app/api/admin/auth/logout/route.ts"
  ]) {
    const route = await readRoute(path);
    assert.match(route, /successResponse\(\{\}\)/);
    assert.doesNotMatch(route, /NextResponse\.json/);
  }
});
