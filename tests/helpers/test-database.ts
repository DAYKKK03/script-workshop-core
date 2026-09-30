import { isIPv6 } from "node:net";

export type PostgresPhysicalTarget = {
  host: string;
  port: string;
  database: string;
};

/** Parses only the physical PostgreSQL target, excluding credentials and query settings. */
export function parsePostgresPhysicalTarget(value: string): PostgresPhysicalTarget {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Database test safety check failed");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Database test safety check failed");
  }
  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("Database test safety check failed");
  }
  if (!url.hostname || !database || database.includes("/")) {
    throw new Error("Database test safety check failed");
  }
  return {
    host: normalizePhysicalHost(url.hostname),
    port: url.port || "5432",
    database: database.toLowerCase()
  };
}

/**
 * Allows only `test`, `test_*`, or `*_test`, then proves it is not the same
 * physical database as DATABASE_URL. PostgreSQL schemas do not provide enough
 * isolation for destructive integration tests in this project.
 */
export function assertIsolatedTestDatabaseUrl(
  testDatabaseUrl: string,
  primaryDatabaseUrl: string | undefined
) {
  if (!primaryDatabaseUrl?.trim()) throw new Error("Database test safety check failed");
  const testTarget = parsePostgresPhysicalTarget(testDatabaseUrl);
  if (!/^(?:test(?:_.+)?|.+_test)$/u.test(testTarget.database)) {
    throw new Error("Database test safety check failed");
  }
  const primaryTarget = parsePostgresPhysicalTarget(primaryDatabaseUrl);
  if (
    testTarget.host === primaryTarget.host &&
    testTarget.port === primaryTarget.port &&
    testTarget.database === primaryTarget.database
  ) {
    throw new Error("Database test safety check failed");
  }
  return testTarget;
}

/** Normalizes only syntactic loopback forms; it intentionally performs no DNS lookup. */
function normalizePhysicalHost(hostname: string) {
  let canonicalHostname: string;
  try {
    // The WHATWG special-host parser canonicalizes legacy IPv4 forms locally.
    // Constructing a URL performs no DNS lookup or network request.
    canonicalHostname = new URL(`http://${hostname}`).hostname;
  } catch {
    throw new Error("Database test safety check failed");
  }
  const normalized = canonicalHostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (normalized === "localhost" || normalized === "localhost.") return "loopback";
  if (/^127(?:\.\d{1,3}){3}$/u.test(normalized)) return "loopback";
  if (isIPv6(normalized)) {
    if (normalized === "::1" || isMappedIpv4Loopback(normalized)) return "loopback";
    return normalized;
  }
  return normalized;
}

function isMappedIpv4Loopback(value: string) {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/iu.exec(value);
  if (!match) return false;
  const highWord = Number.parseInt(match[1], 16);
  return (highWord >> 8) === 127;
}
