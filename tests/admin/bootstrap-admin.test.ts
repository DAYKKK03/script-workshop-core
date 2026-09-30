import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { provisionInitialAdmin } from "../../lib/admin/bootstrap.ts";

async function temporaryOutputPath() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "admin-bootstrap-"));
  return path.join(directory, "setup.json");
}

test("does not create an administrator when the setup file cannot be created", async () => {
  const outputFile = await temporaryOutputPath();
  await writeFile(outputFile, "occupied", { mode: 0o600 });
  let createCalls = 0;

  await assert.rejects(
    provisionInitialAdmin({
      outputFile,
      setupMaterial: "restricted setup material",
      createAdmin: async () => {
        createCalls += 1;
      }
    }),
    /setup file/i
  );

  assert.equal(createCalls, 0);
  assert.equal(await readFile(outputFile, "utf8"), "occupied");
});

test("removes setup material when administrator creation fails", async () => {
  const outputFile = await temporaryOutputPath();

  await assert.rejects(
    provisionInitialAdmin({
      outputFile,
      setupMaterial: "restricted setup material",
      createAdmin: async () => {
        throw new Error("database unavailable");
      }
    }),
    /administrator bootstrap failed/i
  );

  await assert.rejects(stat(outputFile), { code: "ENOENT" });
});

test("creates the administrator only after writing a mode 0600 setup file", async () => {
  const outputFile = await temporaryOutputPath();
  let materialSeenByCreate = "";

  await provisionInitialAdmin({
    outputFile,
    setupMaterial: "restricted setup material",
    createAdmin: async () => {
      materialSeenByCreate = await readFile(outputFile, "utf8");
    }
  });

  assert.equal(materialSeenByCreate, "restricted setup material");
  assert.equal((await stat(outputFile)).mode & 0o777, 0o600);
});
