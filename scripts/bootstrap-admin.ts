import "dotenv/config";
import { Secret, TOTP } from "otpauth";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { isAdminPasswordAllowed } from "../lib/auth/password-policy";
import { encryptTotpSecret, generateRecoveryCodes, hashRecoveryCode } from "../lib/admin/security";
import { provisionInitialAdmin } from "../lib/admin/bootstrap";

async function main() {
  const account = process.env.BOOTSTRAP_ADMIN_ACCOUNT?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  const outputFile = process.env.BOOTSTRAP_ADMIN_OUTPUT_FILE?.trim();
  if (!account || !isAdminPasswordAllowed(password) || !outputFile) {
    throw new Error(
      "Set BOOTSTRAP_ADMIN_ACCOUNT, a 12-128 character BOOTSTRAP_ADMIN_PASSWORD, and BOOTSTRAP_ADMIN_OUTPUT_FILE"
    );
  }
  if (await prisma.adminUser.count()) throw new Error("An administrator already exists; use the OWNER console instead");

  const secret = new Secret({ size: 20 }).base32;
  const recoveryCodes = generateRecoveryCodes();
  const totp = new TOTP({ issuer: "短视频脚本后台", label: account, secret });
  const passwordHash = await hashPassword(password);
  const totpSecretEncrypted = encryptTotpSecret(secret);
  const recoveryCodeHashes = recoveryCodes.map((code) => ({ codeHash: hashRecoveryCode(code) }));

  await provisionInitialAdmin({
    outputFile,
    setupMaterial: JSON.stringify({ provisioningUri: totp.toString(), recoveryCodes }),
    createAdmin: async () => {
      await prisma.adminUser.create({
        data: {
          account,
          passwordHash,
          role: "OWNER",
          totpSecretEncrypted,
          recoveryCodes: { create: recoveryCodeHashes }
        }
      });
    }
  });
  process.stdout.write("Administrator created; setup material written to the restricted output file.\n");
}

main().finally(() => prisma.$disconnect());
