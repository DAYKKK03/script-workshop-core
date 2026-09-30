import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTikHubFetchVideoUrl,
  douyinTranscriptProvider,
  normalizeTikHubApiBaseUrl
} from "../../lib/douyin/transcript-provider.ts";

const providerEnvKeys = [
  "DOUYIN_PROVIDER",
  "TIKHUB_API_KEY",
  "TIKHUB_API_BASE_URL",
  "MEDIA_RELAY_ENABLED",
  "VOLCENGINE_ASR_SUBMIT_ENDPOINT",
  "VOLCENGINE_ASR_API_KEY",
  "VOLCENGINE_ASR_RESOURCE_ID",
  "VOLCENGINE_ASR_MODEL"
] as const;

async function withProviderFetchStub(
  payload: unknown,
  callback: (calls: Array<{ method: string; url: string }>) => Promise<void>
) {
  const previousEnv = Object.fromEntries(
    providerEnvKeys.map((key) => [key, process.env[key]])
  );
  const previousFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string }> = [];

  Object.assign(process.env, {
    DOUYIN_PROVIDER: "tikhub",
    TIKHUB_API_KEY: "test-key",
    TIKHUB_API_BASE_URL: "https://api.tikhub.test",
    MEDIA_RELAY_ENABLED: "0",
    VOLCENGINE_ASR_SUBMIT_ENDPOINT: "https://asr.example.test/submit",
    VOLCENGINE_ASR_API_KEY: "test-asr-key",
    VOLCENGINE_ASR_RESOURCE_ID: "volc.seedasr.auc",
    VOLCENGINE_ASR_MODEL: "bigmodel"
  });

  globalThis.fetch = async (input, init) => {
    const method = init?.method || "GET";
    calls.push({ method, url: String(input) });

    if (method === "GET") {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({ transcript: "这是由 ASR 返回的口播文本测试。" }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-api-status-code": "20000000"
        }
      }
    );
  };

  try {
    await callback(calls);
  } finally {
    globalThis.fetch = previousFetch;

    for (const key of providerEnvKeys) {
      const previous = previousEnv[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  }
}

test("rewrites deprecated mcp TikHub base URL to the official API domain", () => {
  assert.equal(
    normalizeTikHubApiBaseUrl("https://mcp.tikhub.io"),
    "https://api.tikhub.io"
  );

  const url = buildTikHubFetchVideoUrl(
    "https://mcp.tikhub.io",
    "https://v.douyin.com/e3x2fjE/"
  );

  assert.equal(
    url,
    "https://api.tikhub.io/api/v1/douyin/web/fetch_one_video_by_share_url?share_url=https%3A%2F%2Fv.douyin.com%2Fe3x2fjE%2F"
  );
});

test("keeps the official TikHub domains unchanged", () => {
  assert.equal(
    normalizeTikHubApiBaseUrl("https://api.tikhub.io"),
    "https://api.tikhub.io"
  );
  assert.equal(
    normalizeTikHubApiBaseUrl("https://api.tikhub.dev"),
    "https://api.tikhub.dev"
  );
});

test("uses ASR when TikHub returns media alongside title-like text", async () => {
  await withProviderFetchStub(
    {
      data: {
        aweme_detail: {
          desc: "烧烤标题 #同城美食",
          text: "烧烤标题 #同城美食",
          video: {
            play_addr: {
              url_list: ["https://cdn.example.test/video.mp4"]
            }
          }
        }
      }
    },
    async (calls) => {
      const result = await douyinTranscriptProvider(
        "https://v.douyin.com/test/"
      );

      assert.equal(result.status, "success");
      if (result.status === "success") {
        assert.equal(result.source, "authorized_media_asr");
        assert.equal(result.originalTranscript, "这是由 ASR 返回的口播文本测试。");
      }

      assert.equal(calls.filter((call) => call.method === "GET").length, 1);
      assert.equal(calls.filter((call) => call.method === "POST").length, 1);
    }
  );
});

test("uses a trusted direct transcript when TikHub has no media URL", async () => {
  await withProviderFetchStub(
    {
      data: {
        aweme_detail: {
          transcript: "这是没有媒体地址时的可信直接转写文本。"
        }
      }
    },
    async (calls) => {
      const result = await douyinTranscriptProvider(
        "https://v.douyin.com/test/"
      );

      assert.deepEqual(result, {
        status: "success",
        originalTranscript: "这是没有媒体地址时的可信直接转写文本。",
        source: "provider_transcript",
        audioUrl: undefined
      });
      assert.equal(calls.filter((call) => call.method === "GET").length, 1);
      assert.equal(calls.filter((call) => call.method === "POST").length, 0);
    }
  );
});

test("rejects title-like text when TikHub has no media URL", async () => {
  await withProviderFetchStub(
    {
      data: {
        aweme_detail: {
          title: "烧烤标题",
          desc: "烧烤标题 #同城美食",
          text: "烧烤标题 #同城美食",
          caption: "烧烤标题 #同城美食",
          subtitle: "烧烤标题"
        }
      }
    },
    async (calls) => {
      const result = await douyinTranscriptProvider(
        "https://v.douyin.com/test/"
      );

      assert.equal(result.status, "failed");
      if (result.status === "failed") {
        assert.equal(result.errorCode, "TIKHUB_PROVIDER_RESPONSE_UNSUPPORTED");
        assert.ok(result.diagnostic);
      }
      assert.equal(calls.filter((call) => call.method === "GET").length, 1);
      assert.equal(calls.filter((call) => call.method === "POST").length, 0);
    }
  );
});
