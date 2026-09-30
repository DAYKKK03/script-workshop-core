export function isTrustedWriteOrigin({
  origin,
  requestUrl,
  configuredAppUrl
}: {
  origin: string | null;
  requestUrl: string;
  configuredAppUrl?: string;
}) {
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const requestOrigin = new URL(requestUrl).origin;
    const configuredOrigin = configuredAppUrl
      ? new URL(configuredAppUrl).origin
      : requestOrigin;

    return originUrl.origin === requestOrigin || originUrl.origin === configuredOrigin;
  } catch {
    return false;
  }
}
