import assert from "node:assert/strict";
import test from "node:test";

test("production Prisma logging cannot emit record values", async () => {
  const config = await import("../../lib/prisma-config.ts").catch(() => ({
    getPrismaLogLevels: undefined
  }));

  assert.equal(typeof config.getPrismaLogLevels, "function");
  assert.deepEqual(config.getPrismaLogLevels?.("production"), []);
  assert.deepEqual(config.getPrismaLogLevels?.("development"), ["warn"]);
});
