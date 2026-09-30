# TikHub 字段映射问题与修复方案

> 诊断时间：2026-06-25
> 诊断人：Hermes Agent

---

## 一、当前问题

用户提交抖音链接后，系统**无法提取完整口播文案**。实际返回的内容是视频标题（几个字），不是完整口播。

---

## 二、根因分析

### 问题 1：`desc` 被误当作口播文案

**文件：** `lib/douyin/transcript-provider.ts` 第 99-110 行

```typescript
const transcriptFieldKeys = [
  "transcript",
  "text",
  "caption",
  "subtitle",
  "desc",              // ← BUG: 这是视频标题，不是口播文案
  "asrText",
  "asr_text",
  ...
];
```

**实际 TikHub 返回的 `desc`：**
```
"上千万，总共就这 3 招 #商业 #商业模式 #知识付费"
```
→ 这是抖音视频标题 + 话题标签，只有 20-50 字。

**影响：**
代码在 `tikhubDouyinProvider()` 中一找到 `desc` 字段，就认为提取成功，直接返回。**永远不会执行后续的 ASR 语音识别流程。**

---

### 问题 2：视频 URL 字段路径不匹配

**文件：** `lib/douyin/transcript-provider.ts` 第 111-120 行

```typescript
const mediaUrlFieldKeys = [
  "authorizedMediaUrl",
  "authorized_media_url",
  "audioUrl",
  "audio_url",
  "videoUrl",
  "video_url",
  "mediaUrl",
  "media_url"
];
```

**TikHub 实际返回的视频地址路径：**
```json
{
  "data": {
    "aweme_detail": {
      "video": {
        "play_addr": {
          "url_list": ["<authorized-media-url>"]
        }
      }
    }
  }
}
```

**代码当前的 `findExplicitStringField()` 函数**会递归搜索对象，但只匹配**字段名（key）**，不匹配嵌套路径。`mediaUrlFieldKeys` 中的字段名在 TikHub 响应中**一个都不存在**，所以永远找不到视频 URL。

**影响：**
即使去掉 `desc`，代码也拿不到视频地址，会在第 195 行返回 `EXTRACTION_FAILED`。

---

### 问题 3：ASR 语音识别服务未配置

**文件：** `lib/douyin/transcript-provider.ts` 第 233-287 行

`volcengineAsrTranscriptProvider()` 已预留，但需要以下环境变量：

```
ASR_API_KEY=""
ASR_API_BASE_URL=""
```

当前 `.env.local` 中**没有配置**这两个变量，所以即使拿到视频 URL，也无法进行语音转文字。

---

## 三、当前调用链完整路径

```
用户提交抖音链接
  → POST /api/douyin/extract-transcript
    → douyinTranscriptProvider(url)
      → tikhubDouyinProvider(url)
        → TikHub API 返回:
            desc: "视频标题"           ← 20-50字
            video.play_addr.url_list: [...]  ← 视频地址（有）
            chapter_abstract: "..."    ← AI摘要（有）
        → findExplicitStringField(transcriptFieldKeys)
          → 找到 desc = "视频标题" ✅（但其实不对！）
        → 返回 success { transcript: "视频标题" }
          ↑ 函数提前返回，不走 ASR
    → 前端收到 "上千万，总共就这 3 招" ❌
```

**期望路径：**

```
用户提交抖音链接
  → douyinTranscriptProvider(url)
    → tikhubDouyinProvider(url)
      → TikHub API 返回:
            video.play_addr.url_list[0]: "<authorized-media-url>"  ← 视频URL
      → 提取视频URL（用正确路径）
      → 没有找到口播文案
      → 把视频URL送 ASR 语音识别
        → volcengineAsrTranscriptProvider(mediaUrl)
          → ASR 返回口播文案
      → 返回 success { transcript: "完整口播文案..." } ✅
```

---

## 四、修复合集

### 需要改 1 个文件 + 加 1 个环境变量

| 序号 | 改动 | 文件 | 说明 |
|------|------|------|------|
| 1️⃣ | **从 `transcriptFieldKeys` 中移除 `desc`** | `lib/douyin/transcript-provider.ts:103` | 防止视频标题被当成口播文案 |
| 2️⃣ | **为 TikHub 添加视频 URL 提取逻辑** | `lib/douyin/transcript-provider.ts` | 从 `data.aweme_detail.video.play_addr.url_list[0]` 取视频地址 |
| 3️⃣ | **配置 ASR 环境变量** | `.env.local` | `ASR_API_KEY` + `ASR_API_BASE_URL` |

---

### 改动细节

#### 1️⃣ 移除 `desc`

```diff
 const transcriptFieldKeys = [
   "transcript",
   "text",
   "caption",
   "subtitle",
-  "desc",              // ← 删除，这是视频标题不是文案
   "asrText",
   ...
 ];
```

如果仍然想用 `desc` 作为**兜底**（即完全没有其他内容时才用它），需要改逻辑：

```typescript
// 优先找真正的口播字段
const realTranscriptFields = ["transcript", "text", "caption", "subtitle", "asrText", "asr_text", ...];
const fallbackFields = ["desc"];  // 仅当真实字段都为空时才用

let transcript = findExplicitStringField(payload, realTranscriptFields);
if (!transcript) {
  transcript = findExplicitStringField(payload, fallbackFields);  // 兜底：视频标题
}
```

#### 2️⃣ 提取视频 URL

在 `tikhubDouyinProvider()` 中增加直接从 TikHub 响应路径提取视频 URL 的逻辑：

```typescript
// 优先用通用字段查找（兼容其他 provider）
let videoUrl = normalizeHttpUrl(findExplicitStringField(payload, mediaUrlFieldKeys));

// 如果没找到，尝试 TikHub 特定的嵌套路径
if (!videoUrl) {
  const urlList = payload?.data?.aweme_detail?.video?.play_addr?.url_list;
  if (Array.isArray(urlList) && urlList.length > 0) {
    videoUrl = normalizeHttpUrl(urlList[0]);
  }
}
```

#### 3️⃣ 配置 ASR

在 `.env.local` 中添加：

```bash
# ASR 语音识别服务（用来把视频转成口播文案）
ASR_API_KEY=""
ASR_API_BASE_URL=""
```

---

## 五、验证方式

修复后，用任意抖音链接测试：

```bash
curl -X POST http://localhost:3000/api/douyin/extract-transcript \
  -H "Content-Type: application/json" \
  -d '{"douyinUrl":"<douyin-share-url>"}'
```

期望返回：
```json
{
  "success": true,
  "data": {
    "originalTranscript": "大家好，今天我们来聊一聊...（完整口播文案）",
    "source": "authorized_media_asr",
    "audioUrl": "<authorized-media-url>"
  }
}
```
