import { lookup } from "node:dns/promises";
import net from "node:net";

export type HostResolver = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

export type SafeUrlResult =
  | { status: "success"; url: URL }
  | { status: "failed"; reason: "invalid_url" | "unsupported_protocol" | "blocked_host" };

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

export async function validateExternalMediaUrl(
  value: string,
  resolveHost: HostResolver = defaultResolveHost
): Promise<SafeUrlResult> {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return { status: "failed", reason: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { status: "failed", reason: "unsupported_protocol" };
  }

  const hostname = url.hostname.toLowerCase();

  if (blockedHostnames.has(hostname) || hostname.endsWith(".localhost")) {
    return { status: "failed", reason: "blocked_host" };
  }

  if (isBlockedIp(hostname)) {
    return { status: "failed", reason: "blocked_host" };
  }

  try {
    const addresses = await resolveHost(hostname);
    if (addresses.length === 0 || addresses.some((item) => isBlockedIp(item.address))) {
      return { status: "failed", reason: "blocked_host" };
    }
  } catch {
    return { status: "failed", reason: "blocked_host" };
  }

  return { status: "success", url };
}

async function defaultResolveHost(hostname: string) {
  const result = await lookup(hostname, { all: true, verbatim: true });
  return result.map((item) => ({ address: item.address, family: item.family }));
}

function isBlockedIp(value: string) {
  const ipVersion = net.isIP(value);

  if (ipVersion === 4) {
    return isBlockedIpv4(value);
  }

  if (ipVersion === 6) {
    return isBlockedIpv6(value);
  }

  return false;
}

function isBlockedIpv4(value: string) {
  const parts = value.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}
