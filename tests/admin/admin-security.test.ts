import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageAdmins,
  canManageInvites,
  canManageUserLimits
} from "../../lib/admin/permissions.ts";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode
} from "../../lib/admin/security.ts";

test("OWNER can manage admins and account limits", () => {
  assert.equal(canManageAdmins("OWNER"), true);
  assert.equal(canManageUserLimits("OWNER"), true);
});

test("OPERATOR can manage invites but not admins or account limits", () => {
  assert.equal(canManageInvites("OPERATOR"), true);
  assert.equal(canManageAdmins("OPERATOR"), false);
  assert.equal(canManageUserLimits("OPERATOR"), false);
});

test("TOTP secrets are encrypted and authenticated", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);

  assert.notEqual(encrypted, "JBSWY3DPEHPK3PXP");
  assert.equal(decryptTotpSecret(encrypted, key), "JBSWY3DPEHPK3PXP");
  assert.throws(() => decryptTotpSecret(`${encrypted}x`, key));
});

test("recovery codes are unique and only persisted as hashes", () => {
  const codes = generateRecoveryCodes(8);
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  assert.ok(
    codes.every((code) => /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/.test(code))
  );
  const firstHash = hashRecoveryCode(codes[0], "a".repeat(32));
  assert.notEqual(firstHash, codes[0]);
  assert.notEqual(firstHash, hashRecoveryCode(codes[0], "b".repeat(32)));
});
