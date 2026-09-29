import assert from "node:assert/strict";
import test from "node:test";

test("staging administrator runtime requires every server-side test dependency", async () => {
  const policy = await import("./admin-runtime-policy.ts").catch(() => ({
    readStagingAdminRuntimeConfig: undefined
  }));

  assert.equal(typeof policy.readStagingAdminRuntimeConfig, "function");
  const result = policy.readStagingAdminRuntimeConfig?.({
    TEST_DATABASE_URL: "postgresql://app:test-only@localhost:5432/example_test",
    STAGING_BASE_URL: "http://localhost:8080",
    STAGING_ORIGIN_SECRET: "origin-present"
  });

  assert.deepEqual(result, {
    enabled: false,
    missing: [
      "STAGING_ADMIN_MFA_ENCRYPTION_KEY",
      "STAGING_ADMIN_RECOVERY_CODE_PEPPER"
    ]
  });
});

test("bootstrap failures are reduced to safe error classifications", async () => {
  const policy = await import("./admin-runtime-policy.ts").catch(() => ({
    classifyBootstrapFailure: undefined
  }));

  assert.equal(typeof policy.classifyBootstrapFailure, "function");
  assert.equal(
    policy.classifyBootstrapFailure?.("ADMIN_MFA_ENCRYPTION_KEY is not configured"),
    "BOOTSTRAP_CONFIGURATION_MISSING"
  );
  assert.equal(
    policy.classifyBootstrapFailure?.("Administrator setup file could not be created"),
    "BOOTSTRAP_PROVISION_FILE_FAILED"
  );
  assert.equal(
    policy.classifyBootstrapFailure?.("Can't reach database server"),
    "BOOTSTRAP_DATABASE_UNAVAILABLE"
  );
  assert.equal(
    policy.classifyBootstrapFailure?.("unexpected provider detail"),
    "BOOTSTRAP_UNKNOWN_FAILED"
  );
});

test("staging runtime accepts only local or isolated Compose application hosts", async () => {
  const policy = await import("./admin-runtime-policy.ts").catch(() => ({
    isAllowedStagingBaseUrl: undefined
  }));

  assert.equal(typeof policy.isAllowedStagingBaseUrl, "function");
  assert.equal(policy.isAllowedStagingBaseUrl?.("http://127.0.0.1:8080"), true);
  assert.equal(policy.isAllowedStagingBaseUrl?.("http://localhost:8080"), true);
  assert.equal(policy.isAllowedStagingBaseUrl?.("http://caddy"), true);
  assert.equal(policy.isAllowedStagingBaseUrl?.("https://external.example"), false);
});
