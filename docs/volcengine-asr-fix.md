# 火山引擎 ASR 调用分析报告

> 诊断时间：2026-06-25
> 诊断人：Hermes Agent

---

## 一、环境配置

```bash
VOLCENGINE_ASR_ENDPOINT="https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"
VOLCENGINE_ASR_RESOURCE_ID="volc.seedasr.auc"
VOLCENGINE_ASR_MODEL="bigmodel"
VOLCENGINE_ASR_API_KEY="<server-only-secret>"
```

---

## 二、实际测试结果

### ✅ ASR 提交成功

```
POST /api/v3/auc/bigmodel/submit

请求体:
{
  "user": { "uid": "douyin-script-rewriter" },
  "audio": {
    "url": "<authorized-media-url>",
    "format": "mp4",
    "codec": "raw",
    "rate": 16000,
    "bits": 16,
    "channel": 1
  },
  "request": {
    "model_name": "bigmodel",
    "enable_itn": true,
    ...
  }
}

响应:
  Status: 200
  Header: x-api-status-code: 20000000   ← 已接受
  Header: x-api-message: OK
  Body: {}
```

### ⚠️ 第一次查询（2秒后）—— 处理中

```
POST /api/v3/auc/bigmodel/query

请求体: {}

响应:
  Status: 200
  Header: x-api-status-code: 20000001   ← 处理中
  Header: x-api-message: [Processing in progress] Start Processing
  Body: {
    "audio_info": {},
    "result": {
      "text": ""                         ← 还没处理完
    }
  }
```

### ❌ 后续查询 —— 任务消失

```
后面再查，返回:
  Status: 200
  Header: x-api-status-code: 45000006   ← 任务不存在
  Body: {}
```

---

## 三、根因分析

### 问题 1：后续查询找不到任务

火山引擎 ASR 通过 `X-Api-Request-Id` 请求头关联提交和查询。但第一次查询返回 `20000001` 后，任务可能被标记为**已消费**，后续用相同 `requestId` 查询返回 `45000006`（任务不存在）。

**当前代码的 `pollVolcengineAsrResult()`** 连续轮询 3 次（每次间隔 1 秒），但：

| 轮次 | 火山返回 | 当前代码行为 | 问题 |
|------|----------|-------------|------|
| 第1次 | 20000001, text="" | 没找到文本 → 继续轮询 | ✅ |
| 第2次 | 45000006, body={} | 返回 submitted → 被当作"失败" | ❌ 实际还在处理，但任务找不到了 |

**根因：** `pollVolcengineAsrResult` 在 `response.ok` 为 false 时直接返回 `status: "submitted"`，没有区分 `45000006`（暂时不可查）和真正的失败。

### 问题 2：`codec: "raw"` 与 `format: "mp4"` 不匹配

```typescript
audio: {
  url: normalizedMediaUrl,
  format: inferAudioFormat(normalizedMediaUrl),  // 返回 "mp4"
  codec: "raw",   // ← 问题！mp4 容器内的音频是 aac 编码，不是 raw
  rate: 16000,
  bits: 16,
  channel: 1
},
```

说明：
- `format: "mp4"` → 告诉 ASR 用 mp4 解复用器
- `codec: "raw"` → 告诉 ASR 音频数据是原始 PCM
- **这两者矛盾**，mp4 的音频流不是 raw PCM，火山引擎可能需要先解码，但 codec 参数说它是 raw，导致解码失败/处理异常

### 问题 3：抖音视频 CDN URL 可能需要鉴权

```
curl -I 抖音视频URL → Status: 302 (重定向)
```

火山引擎 ASR 服务去下载这个视频时，可能需要处理 302 重定向链，或需要特定的 Cookie/User-Agent。有些 CDN URL 还可能是**带过期时间的临时签名 URL**。

---

## 四、修复合集

### 需要改 3 处

| # | 改动 | 文件 | 说明 |
|---|------|------|------|
| 1️⃣ | **修复 `codec` 参数** | `lib/asr/volcengine-asr-provider.ts:147` | `codec: "raw"` → 移除 codec 字段，或根据 format 动态设置 |
| 2️⃣ | **修复轮询逻辑** | `lib/asr/volcengine-asr-provider.ts:287-291` | `45000006` 不应直接返回 submitted，应该继续等待或增加间隔 |
| 3️⃣ | **查询间隔加大 + 重试次数增多** | `lib/asr/volcengine-asr-provider.ts:90-95` | ASR 处理可能需要 10-30 秒，1 秒间隔 × 3 次不够 |

---

### 改动细节

#### 1️⃣ 修复 codec 参数

```diff
 audio: {
   url: normalizedMediaUrl,
   format: inferAudioFormat(normalizedMediaUrl),
-  codec: "raw",
+  // 不指定 codec，让火山引擎根据 format 自动检测
   rate: 16000,
   bits: 16,
   channel: 1
 },
```

或者更精确地根据 format 设置：

```typescript
const format = inferAudioFormat(normalizedMediaUrl);
const audioCodec = format === "mp4" ? "aac" : "raw";

// 在 body 中:
audio: {
  url: normalizedMediaUrl,
  format: format,
  codec: audioCodec,   // mp4 → aac, 其他 → raw
  rate: 16000,
  bits: 16,
  channel: 1
}
```

#### 2️⃣ 修复轮询逻辑

```diff
 // pollVolcengineAsrResult 中的失败处理
-if (!response.ok) {
+const statusCode = response.headers.get("x-api-status-code");
+const isTransientError = statusCode === "45000006" || !response.ok;
+
+if (isTransientError && attempt < maxAttempts) {
+  // 临时错误，继续轮询（不跳过）
+  continue;
+}
+
+if (!response.ok) {
   return {
     status: "submitted",
     queryAttempts: attempt
   };
 }
```

#### 3️⃣ 增加等待时间和重试次数

在 `.env.local` 中配置：

```bash
# ASR 查询参数（视频转文字通常需要 10-30 秒）
VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS=15    # 最多重试 15 次
VOLCENGINE_ASR_QUERY_INTERVAL_MS=3000   # 每次间隔 3 秒
# 总计最长等待：15 × 3 = 45 秒
```

---

## 五、更好的方案：改用同步 ASR 接口

如果火山引擎支持同步模式（提交后直接等待结果返回），建议改用同步接口，避免复杂的轮询逻辑。

火山引擎的 `api/v3/auc/bigmodel` 有同步模式：将请求发到不带 `/submit` 的端点，在请求参数中增加 `"wait": true` 或设置更长的超时时间。

如果同步不可用，考虑换用其他 ASR 方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| **OpenAI Whisper API** | 同步返回，响应快 | 需 OpenAI Key |
| **火山引擎同步** | 已有账号 | 需确认接口是否支持 |
| **阿里云语音识别** | 同步接口 | 需新申请 |

---

## 六、验证方式

---

## 七、2026-07-06 收口修复记录

### 本次修复点

1. `lib/asr/volcengine-asr-provider.ts` 不再向火山 ASR 提交体写死 `codec: "raw"`。
2. ASR 查询轮询遇到火山短暂返回的 `x-api-status-code: 45000006` 时，在仍有轮询次数的情况下继续等待，而不是立即判定为 Provider 拒绝。

### 为什么这样设计

抖音授权媒体地址常见来源是 TikHub 返回的视频或音频 URL，其中视频候选通常按 `mp4` 处理，音频候选可能是 `mp3`、`m4a`、`aac` 等格式。固定传 `codec: "raw"` 会把容器/编码格式和原始 PCM 混在一起，容易让 ASR 服务按错误方式解码。去掉 `codec` 后，服务端可根据 `format` 和实际媒体内容自行识别，保留现有 `format` 字段作为主提示。

`45000006` 在真实联调中曾出现在 submit 已接受后的短时间查询阶段。它不应和永久性认证失败、参数失败混为一类；在轮询窗口内继续等待，可以吸收 Provider 的短暂一致性问题，同时仍由最大轮询次数兜底，避免请求无限挂起。

### 优点

- 不改变 PRD 范围，不增加手动粘贴兜底，也不引入违规抓取。
- 保持 TikHub 只负责提供合规授权媒体，ASR 只负责转写，模块边界清晰。
- 对真实 Provider 的短暂状态更宽容，减少“当前链接无法自动提取”的误报。
- 保留统一失败提示，不向用户暴露 Provider、密钥、内部状态或堆栈。

### 能做到什么

- 对 mp4/m4a/aac 等非 raw 媒体，避免错误 codec 影响火山 ASR 解码。
- 对 submit 后短时间查询不到任务的情况，在配置的轮询次数内继续尝试。
- 通过单元测试覆盖提交体格式和短暂查询状态。

### 做不到什么

- 不能保证所有抖音链接都可提取；如果 TikHub 不返回可访问授权媒体，仍会失败。
- 不能解决已过期、Provider 无法下载、无音轨、静音或平台限制导致的 ASR 失败。
- 不能替代生产环境密钥、回源、证书和 Provider 额度/权限配置。

修复后：

```bash
# 1. 先启动 dev server
npm run dev

# 2. 用 curl 测试完整链路
curl -X POST http://localhost:3000/api/douyin/extract-transcript \
  -H "Content-Type: application/json" \
  -d '{"douyinUrl":"<douyin-share-url>"}'

# 期望返回:
# {
#   "success": true,
#   "data": {
#     "originalTranscript": "<transcript>",
#     "source": "authorized_media_asr",
#     "audioUrl": "<authorized-media-url>"
#   }
# }
```
