export type StagingAdminRuntimeConfig =
  | {
      enabled: false;
      missing: string[];
    }
  | {
      enabled: true;
      databaseUrl: string;
      baseUrl: string;
      originSecret: string;
      adminMfaEncryptionKey: string;
      adminRecoveryCodePepper: string;
    };

const requiredVariables = [
  "TEST_DATABASE_URL",
  "STAGING_BASE_URL",
  "STAGING_ORIGIN_SECRET",
  "STAGING_ADMIN_MFA_ENCRYPTION_KEY",
  "STAGING_ADMIN_RECOVERY_CODE_PEPPER"
] as const;

export function readStagingAdminRuntimeConfig(
  env: Record<string, string | undefined>
): StagingAdminRuntimeConfig {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());
  if (missing.length) return { enabled: false, missing };

  return {
    enabled: true,
    databaseUrl: env.TEST_DATABASE_URL!.trim(),
    baseUrl: env.STAGING_BASE_URL!.trim(),
    originSecret: env.STAGING_ORIGIN_SECRET!.trim(),
    adminMfaEncryptionKey: env.STAGING_ADMIN_MFA_ENCRYPTION_KEY!.trim(),
    adminRecoveryCodePepper: env.STAGING_ADMIN_RECOVERY_CODE_PEPPER!.trim()
  };
}

export type BootstrapFailureCode =
  | "BOOTSTRAP_CONFIGURATION_MISSING"
  | "BOOTSTRAP_INPUT_INVALID"
  | "BOOTSTRAP_PROVISION_FILE_FAILED"
  | "BOOTSTRAP_DATABASE_UNAVAILABLE"
  | "BOOTSTRAP_DATABASE_WRITE_FAILED"
  | "BOOTSTRAP_UNKNOWN_FAILED";

export function classifyBootstrapFailure(output: string): BootstrapFailureCode {
  if (/ADMIN_MFA_ENCRYPTION_KEY|ADMIN_RECOVERY_CODE_PEPPER|SESSION_SECRET/.test(output)) {
    return "BOOTSTRAP_CONFIGURATION_MISSING";
  }
  if (/Set BOOTSTRAP_ADMIN_ACCOUNT|12-128 character/.test(output)) {
    return "BOOTSTRAP_INPUT_INVALID";
  }
  if (/Administrator setup file could not be created/.test(output)) {
    return "BOOTSTRAP_PROVISION_FILE_FAILED";
  }
  if (/Can't reach database server|P1001|P1002/.test(output)) {
    return "BOOTSTRAP_DATABASE_UNAVAILABLE";
  }
  if (/Administrator bootstrap failed/.test(output)) {
    return "BOOTSTRAP_DATABASE_WRITE_FAILED";
  }
  return "BOOTSTRAP_UNKNOWN_FAILED";
}

export function isAllowedStagingBaseUrl(value: string) {
  try {
    return ["127.0.0.1", "localhost", "caddy"].includes(
      new URL(value).hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}
