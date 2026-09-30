import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../lib/prisma";
import { deleteProject } from "../../lib/projects/delete-service";

for (const scenario of [
  { name: "owner can delete a project without auxiliary services", owner: "owner", exists: true, succeeds: true },
  { name: "another account cannot delete the project", owner: "someone-else", exists: true, succeeds: false },
  { name: "missing project returns the same not-found response", owner: "owner", exists: false, succeeds: false }
]) {
  test(scenario.name, async (t) => {
    let present = scenario.exists;
    const originalTransaction = prisma.$transaction;
    const originalDeleteMany = prisma.project.deleteMany;
    t.after(() => {
      prisma.$transaction = originalTransaction;
      prisma.project.deleteMany = originalDeleteMany;
    });
    prisma.$transaction = (() => {
      throw new Error("Project deletion must not require an auxiliary cleanup transaction");
    }) as typeof prisma.$transaction;
    const deletion = t.mock.fn(async ({ where }: { where: { id: string; userId: string } }) => {
      assert.deepEqual(where, { id: "project-1", userId: "owner" });
      if (!present || scenario.owner !== where.userId) return { count: 0 };
      present = false;
      return { count: 1 };
    });
    prisma.project.deleteMany = deletion as unknown as typeof prisma.project.deleteMany;

    if (scenario.succeeds) {
      assert.deepEqual(await deleteProject("project-1", "owner"), { id: "project-1" });
      assert.equal(present, false);
    } else {
      await assert.rejects(deleteProject("project-1", "owner"), { code: "PROJECT_NOT_FOUND", status: 404 });
      assert.equal(present, scenario.exists);
    }
    assert.equal(deletion.mock.callCount(), 1);
  });
}
