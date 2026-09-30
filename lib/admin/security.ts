import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes
} from "crypto";

const algorithm = "aes-256-gcm";

export function encryptTotpSecret(secret: string, encodedKey = getEncryptionKey()) {
  const key = parseEncryptionKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function decryptTotpSecret(value: string, encodedKey = getEncryptionKey()) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid encrypted TOTP secret");
  }

  const decipher = createDecipheriv(
    algorithm,
    parseEncryptionKey(encodedKey),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const value = randomBytes(8).toString("hex").toUpperCase();
    return value.match(/.{4}/g)!.join("-");
  });
}

export function hashRecoveryCode(code: string, pepper = getRecoveryCodePepper()) {
  return createHmac("sha256", pepper)
    .update(code.replaceAll("-", "").trim().toUpperCase())
    .digest("hex");
}

function getRecoveryCodePepper() {
  const pepper =
    process.env.ADMIN_RECOVERY_CODE_PEPPER || process.env.SESSION_SECRET;
  if (!pepper || pepper.length < 32) {
    throw new Error("ADMIN_RECOVERY_CODE_PEPPER is not configured");
  }
  return pepper;
}

function getEncryptionKey() {
  const key = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  if (!key) throw new Error("ADMIN_MFA_ENCRYPTION_KEY is not configured");
  return key;
}

function parseEncryptionKey(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("ADMIN_MFA_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}
