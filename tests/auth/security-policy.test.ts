import assert from "node:assert/strict";
import test from "node:test";

test("creates opaque session tokens and deterministic hashes", async () => {
  const session = await import("../../lib/auth/session-token.ts").catch(() => ({
    createOpaqueSessionToken: undefined,
    hashSessionToken: undefined
  }));

  assert.equal(typeof session.createOpaqueSessionToken, "function");
  assert.equal(typeof session.hashSessionToken, "function");

  const token = session.createOpaqueSessionToken?.();
  assert.equal(typeof token, "string");
  assert.ok((token?.length || 0) >= 43);
  assert.equal(token?.includes("user-test-id"), false);
  assert.equal(session.hashSessionToken?.(token || ""), session.hashSessionToken?.(token || ""));
  assert.notEqual(session.hashSessionToken?.(token || ""), token);
});

test("enforces separate user and administrator password minimums", async () => {
  const password = await import("../../lib/auth/password-policy.ts").catch(() => ({
    isUserPasswordAllowed: undefined,
    isAdminPasswordAllowed: undefined
  }));

  assert.equal(password.isUserPasswordAllowed?.("123456789"), false);
  assert.equal(password.isUserPasswordAllowed?.("1234567890"), true);
  assert.equal(password.isAdminPasswordAllowed?.("12345678901"), false);
  assert.equal(password.isAdminPasswordAllowed?.("123456789012"), true);
});

test("accepts same-origin writes and rejects cross-origin writes", async () => {
  const csrf = await import("../../lib/security/csrf.ts").catch(() => ({
    isTrustedWriteOrigin: undefined
  }));

  assert.equal(
    csrf.isTrustedWriteOrigin?.({
      origin: "https://app.example.com",
      requestUrl: "https://app.example.com/api/projects",
      configuredAppUrl: "https://app.example.com"
    }),
    true
  );
  assert.equal(
    csrf.isTrustedWriteOrigin?.({
      origin: "https://evil.example",
      requestUrl: "https://app.example.com/api/projects",
      configuredAppUrl: "https://app.example.com"
    }),
    false
  );
});

test("hashes rate-limit identities without retaining raw values", async () => {
  const rateLimit = await import("../../lib/security/rate-limit-policy.ts").catch(
    () => ({ buildRateLimitKey: undefined, getRateLimitWindow: undefined })
  );

  const key = rateLimit.buildRateLimitKey?.({
    scope: "login-ip",
    identity: "203.0.113.10",
    secret: "test-secret"
  });
  assert.equal(typeof key, "string");
  assert.equal(key?.includes("203.0.113.10"), false);

  const window = rateLimit.getRateLimitWindow?.({
    now: new Date("2026-06-27T10:07:00.000Z"),
    windowMs: 15 * 60 * 1000
  });
  assert.equal(window?.startedAt.toISOString(), "2026-06-27T10:00:00.000Z");
  assert.equal(window?.expiresAt.toISOString(), "2026-06-27T10:15:00.000Z");
});

test("API responses disable storage by browsers and proxies", async () => {
  const policy = await import("../../lib/auth/response-policy.ts").catch(() => ({
    withNoStoreHeaders: undefined
  }));

  assert.equal(typeof policy.withNoStoreHeaders, "function");
  assert.equal(
    new Headers(policy.withNoStoreHeaders?.().headers).get("cache-control"),
    "no-store"
  );
});
