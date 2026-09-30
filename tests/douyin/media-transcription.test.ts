import assert from "node:assert/strict";
import test from "node:test";

test("falls back to video when the preferred audio track is silent", async () => {
  const transcriptionModule = await import(
    "../../lib/douyin/media-transcription.ts"
  ).catch(() => ({ transcribeMediaCandidates: undefined }));

  assert.equal(typeof transcriptionModule.transcribeMediaCandidates, "function");

  const calls: string[] = [];
  const result = await transcriptionModule.transcribeMediaCandidates?.({
    candidates: [
      {
        url: "https://audio.example.invalid/source.mp3",
        kind: "audio",
        format: "mp3"
      },
      {
        url: "https://video.example.invalid/playback",
        kind: "video",
        format: "mp4"
      }
    ],
    transcribe: async ({ mediaUrl }: { mediaUrl: string }) => {
      calls.push(mediaUrl);

      if (mediaUrl.includes("audio.example.invalid")) {
        return {
          status: "failed" as const,
          errorCode: "ASR_NO_AUDIO_TRACK" as const,
          failureType: "invalid_response" as const
        };
      }

      return {
        status: "success" as const,
        transcript: "这是从视频原声中提取出的有效测试口播文案"
      };
    }
  });

  assert.equal(result?.status, "success");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /audio\.example\.invalid/);
  assert.match(calls[1], /video\.example\.invalid/);
});
