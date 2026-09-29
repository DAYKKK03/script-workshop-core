const httpUrlPattern = /https?:\/\/[^\s<>"']+/giu;
const trailingPunctuationPattern = /[),.;!?\]}，。！？；：、）】》”’]+$/u;
export const maximumDouyinShareTextLength = 4000;

export function isDouyinUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "douyin.com" ||
      hostname.endsWith(".douyin.com") ||
      hostname === "iesdouyin.com" ||
      hostname.endsWith(".iesdouyin.com")
    );
  } catch {
    return false;
  }
}

export function extractDouyinUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  if (value.length > maximumDouyinShareTextLength) return null;

  const candidates = value.trim().match(httpUrlPattern) || [];

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.replace(trailingPunctuationPattern, "");

    if (isDouyinUrl(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  return null;
}
