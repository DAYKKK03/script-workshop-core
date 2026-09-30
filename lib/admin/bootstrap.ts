import { unlink, writeFile } from "node:fs/promises";

type ProvisionInitialAdminInput = {
  outputFile: string;
  setupMaterial: string;
  createAdmin: () => Promise<void>;
};

export async function provisionInitialAdmin({
  outputFile,
  setupMaterial,
  createAdmin
}: ProvisionInitialAdminInput) {
  try {
    await writeFile(outputFile, setupMaterial, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
  } catch {
    throw new Error("Administrator setup file could not be created");
  }

  try {
    await createAdmin();
  } catch {
    await unlink(outputFile).catch(() => undefined);
    throw new Error("Administrator bootstrap failed");
  }
}
