import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("administrator account controls include a separate daily topic quota", async () => {
  const [route, table, data] = await Promise.all([
    read("app/api/admin/accounts/route.ts"),
    read("components/admin/accounts-table.tsx"),
    read("lib/admin/data.ts")
  ]);

  assert.match(route, /dailyTopicLimit/);
  assert.match(route, /dailyTopicLimit < 0 \|\| dailyTopicLimit > 1000/);
  assert.match(table, /aria-label="每日选题额度"/);
  assert.match(data, /topicIdeasGenerated/);
});
