import {
  transcribeAuthorizedMediaUrl,
  type VolcengineAsrResult
} from "../asr/volcengine-asr-provider.ts";
import type {
  AuthorizedMediaFormat,
  TikHubAuthorizedMedia
} from "./tikhub-media.ts";

type MediaCandidate = Pick<TikHubAuthorizedMedia, "url" | "kind" | "format">;

type TranscribeMedia = (input: {
  mediaUrl: string;
  mediaFormat?: AuthorizedMediaFormat;
}) => Promise<VolcengineAsrResult>;

export async function transcribeMediaCandidates({
  candidates,
  transcribe = transcribeAuthorizedMediaUrl
}: {
  candidates: MediaCandidate[];
  transcribe?: TranscribeMedia;
}): Promise<VolcengineAsrResult> {
  if (candidates.length === 0) {
    return {
      status: "failed",
      errorCode: "ASR_NO_AUDIO_TRACK",
      failureType: "invalid_media_url"
    };
  }

  let result = await transcribe({
    mediaUrl: candidates[0].url,
    mediaFormat: candidates[0].format
  });

  if (
    result.status === "failed" &&
    result.errorCode === "ASR_NO_AUDIO_TRACK" &&
    candidates[1]
  ) {
    result = await transcribe({
      mediaUrl: candidates[1].url,
      mediaFormat: candidates[1].format
    });
  }

  return result;
}
