import assert from "node:assert/strict";
import test from "node:test";

test("prefers the explicit audio track over a video playback URL", async () => {
  const mediaModule = await import("../../lib/douyin/tikhub-media.ts").catch(
    () => ({ extractTikHubAuthorizedMedia: undefined })
  );

  assert.equal(typeof mediaModule.extractTikHubAuthorizedMedia, "function");

  const result = mediaModule.extractTikHubAuthorizedMedia?.({
    data: {
      aweme_detail: {
        video: {
          play_addr: {
            url_list: ["https://video.example.invalid/playback"]
          }
        },
        music: {
          play_url: {
            url_list: ["https://audio.example.invalid/source.mp3"]
          }
        }
      }
    }
  });

  assert.deepEqual(result, {
    url: "https://audio.example.invalid/source.mp3",
    kind: "audio",
    format: "mp3",
    path: "music.play_url"
  });
});

test("marks an explicit TikHub video path as mp4 even without a URL extension", async () => {
  const mediaModule = await import("../../lib/douyin/tikhub-media.ts").catch(
    () => ({ extractTikHubAuthorizedMedia: undefined })
  );

  assert.equal(typeof mediaModule.extractTikHubAuthorizedMedia, "function");

  const result = mediaModule.extractTikHubAuthorizedMedia?.({
    data: {
      aweme_detail: {
        video: {
          play_addr: {
            url_list: ["https://video.example.invalid/playback"]
          }
        }
      }
    }
  });

  assert.deepEqual(result, {
    url: "https://video.example.invalid/playback",
    kind: "video",
    format: "mp4",
    path: "video.play_addr"
  });
});

test("keeps the video as a fallback when an audio track is available", async () => {
  const mediaModule = await import("../../lib/douyin/tikhub-media.ts").catch(
    () => ({ extractTikHubAuthorizedMediaCandidates: undefined })
  );

  assert.equal(
    typeof mediaModule.extractTikHubAuthorizedMediaCandidates,
    "function"
  );

  const result = mediaModule.extractTikHubAuthorizedMediaCandidates?.({
    data: {
      aweme_detail: {
        video: {
          play_addr: {
            url_list: ["https://video.example.invalid/playback"]
          }
        },
        music: {
          play_url: {
            url_list: ["https://audio.example.invalid/source.mp3"]
          }
        }
      }
    }
  });

  assert.deepEqual(result, [
    {
      url: "https://audio.example.invalid/source.mp3",
      kind: "audio",
      format: "mp3",
      path: "music.play_url"
    },
    {
      url: "https://video.example.invalid/playback",
      kind: "video",
      format: "mp4",
      path: "video.play_addr"
    }
  ]);
});

test("captures the higher-priority web bitrate playback path when present", async () => {
  const mediaModule = await import("../../lib/douyin/tikhub-media.ts").catch(
    () => ({ extractTikHubAuthorizedMediaCandidates: undefined })
  );

  assert.equal(
    typeof mediaModule.extractTikHubAuthorizedMediaCandidates,
    "function"
  );

  const result = mediaModule.extractTikHubAuthorizedMediaCandidates?.({
    data: {
      aweme_detail: {
        video: {
          bit_rate: [
            {
              play_addr: {
                url_list: ["https://video.example.invalid/bitrate-playback"]
              }
            }
          ],
          play_addr: {
            url_list: ["https://video.example.invalid/default-playback"]
          }
        }
      }
    }
  });

  assert.deepEqual(result, [
    {
      url: "https://video.example.invalid/bitrate-playback",
      kind: "video",
      format: "mp4",
      path: "video.bit_rate.play_addr"
    }
  ]);
});

test("extracts explicit TikHub media duration as billing seconds", async () => {
  const mediaModule = await import("../../lib/douyin/tikhub-media.ts");

  assert.equal(
    mediaModule.extractTikHubMediaDurationSeconds?.({
      data: { aweme_detail: { duration: 125_400 } }
    }),
    125
  );
  assert.equal(mediaModule.extractTikHubMediaDurationSeconds?.({}), 0);
});
