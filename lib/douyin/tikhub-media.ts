export type AuthorizedMediaFormat = "mp3" | "wav" | "m4a" | "aac" | "ogg" | "mp4";

export type TikHubAuthorizedMediaPath =
  | "music.play_url"
  | "video.bit_rate.play_addr"
  | "video.play_addr_265"
  | "video.play_addr"
  | "video.play_addr_h264"
  | "video.download_addr"
  | "video.play_addr_lowbr";

export type TikHubAuthorizedMedia = {
  url: string;
  kind: "audio" | "video";
  format: AuthorizedMediaFormat;
  path: TikHubAuthorizedMediaPath;
};

type PathSegment = string | number;

type TikHubMediaPathDescriptor = {
  label: TikHubAuthorizedMediaPath;
  kind: "audio" | "video";
  fallbackFormat: AuthorizedMediaFormat;
  variants: PathSegment[][];
};

const audioPaths: TikHubMediaPathDescriptor[] = [
  {
    label: "music.play_url",
    kind: "audio",
    fallbackFormat: "mp3",
    variants: [
      ["data", "aweme_detail", "music", "play_url", "url_list"],
      ["aweme_detail", "music", "play_url", "url_list"]
    ]
  }
];

const videoPaths: TikHubMediaPathDescriptor[] = [
  {
    label: "video.bit_rate.play_addr",
    kind: "video",
    fallbackFormat: "mp4",
    variants: [
      ["data", "aweme_detail", "video", "bit_rate", 0, "play_addr", "url_list"],
      ["aweme_detail", "video", "bit_rate", 0, "play_addr", "url_list"]
    ]
  },
  {
    label: "video.play_addr_265",
    kind: "video",
    fallbackFormat: "mp4",
    variants: [
      ["data", "aweme_detail", "video", "play_addr_265", "url_list"],
      ["aweme_detail", "video", "play_addr_265", "url_list"]
    ]
  },
  {
    label: "video.play_addr",
    kind: "video",
    fallbackFormat: "mp4",
    variants: [
      ["data", "aweme_detail", "video", "play_addr", "url_list"],
      ["aweme_detail", "video", "play_addr", "url_list"]
    ]
  },
  {
    label: "video.play_addr_h264",
    kind: "video",
    fallbackFormat: "mp4",
    variants: [
      ["data", "aweme_detail", "video", "play_addr_h264", "url_list"],
      ["aweme_detail", "video", "play_addr_h264", "url_list"]
    ]
  },
  {
    label: "video.download_addr",
    kind: "video",
    fallbackFormat: "mp4",
    variants: [
      ["data", "aweme_detail", "video", "download_addr", "url_list"],
      ["aweme_detail", "video", "download_addr", "url_list"]
    ]
  },
  {
    label: "video.play_addr_lowbr",
    kind: "video",
    fallbackFormat: "mp4",
    variants: [
      ["data", "aweme_detail", "video", "play_addr_lowbr", "url_list"],
      ["aweme_detail", "video", "play_addr_lowbr", "url_list"]
    ]
  }
];

const durationPaths = [
  ["data", "aweme_detail", "duration"],
  ["data", "aweme_detail", "video", "duration"],
  ["aweme_detail", "duration"],
  ["aweme_detail", "video", "duration"]
];

export function extractTikHubAuthorizedMedia(
  payload: unknown
): TikHubAuthorizedMedia | undefined {
  return extractTikHubAuthorizedMediaCandidates(payload)[0];
}

export function extractTikHubAuthorizedMediaCandidates(
  payload: unknown
): TikHubAuthorizedMedia[] {
  const candidates: TikHubAuthorizedMedia[] = [];
  const audioCandidate = findFirstMediaCandidate(payload, audioPaths);

  if (audioCandidate) {
    candidates.push(audioCandidate);
  }

  const videoCandidate = findFirstMediaCandidate(payload, videoPaths);

  if (videoCandidate && videoCandidate.url !== audioCandidate?.url) {
    candidates.push(videoCandidate);
  }

  return candidates;
}

export function summarizeTikHubAuthorizedMediaCandidates(
  candidates: TikHubAuthorizedMedia[]
) {
  const selected = candidates[0];

  return {
    selectedMediaKind: selected?.kind,
    selectedMediaFormat: selected?.format,
    selectedMediaPath: selected?.path,
    candidateCount: candidates.length,
    candidateKinds: candidates.map((candidate) => candidate.kind).join(","),
    candidateFormats: candidates.map((candidate) => candidate.format).join(","),
    candidatePaths: candidates.map((candidate) => candidate.path).join(",")
  };
}

export function extractTikHubMediaDurationSeconds(payload: unknown) {
  for (const path of durationPaths) {
    const value = getValueAtCaseInsensitivePath(payload, path);
    const milliseconds =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;

    if (Number.isFinite(milliseconds) && milliseconds > 0) {
      return Math.max(1, Math.round(milliseconds / 1000));
    }
  }

  return 0;
}

function findFirstMediaCandidate(
  payload: unknown,
  descriptors: TikHubMediaPathDescriptor[]
) {
  for (const descriptor of descriptors) {
    for (const path of descriptor.variants) {
      const url = findFirstHttpUrlValue(getValueAtCaseInsensitivePath(payload, path));

      if (url) {
        return {
          url,
          kind: descriptor.kind,
          format: inferFormat(url, descriptor.fallbackFormat),
          path: descriptor.label
        } satisfies TikHubAuthorizedMedia;
      }
    }
  }

  return undefined;
}

function getValueAtCaseInsensitivePath(payload: unknown, path: PathSegment[]): unknown {
  let current = payload;

  for (const pathKey of path) {
    if (typeof pathKey === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }

      current = current[pathKey];
      continue;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    const record = current as Record<string, unknown>;
    const actualKey = Object.keys(record).find(
      (key) => key.toLowerCase() === pathKey.toLowerCase()
    );

    if (!actualKey) {
      return undefined;
    }

    current = record[actualKey];
  }

  return current;
}

function findFirstHttpUrlValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeHttpUrl(value);
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const item of value) {
    const url = findFirstHttpUrlValue(item);

    if (url) {
      return url;
    }
  }

  return undefined;
}

function normalizeHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function inferFormat(
  value: string,
  fallback: AuthorizedMediaFormat
): AuthorizedMediaFormat {
  try {
    const extension = new URL(value).pathname
      .toLowerCase()
      .match(/\.([a-z0-9]+)$/)?.[1];

    if (
      extension === "mp3" ||
      extension === "wav" ||
      extension === "m4a" ||
      extension === "aac" ||
      extension === "ogg" ||
      extension === "mp4"
    ) {
      return extension;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
