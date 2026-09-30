# API_SPEC.md

## 通用响应格式

成功：

```json
{
  "success": true,
  "data": {}
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "用户可读错误提示"
  }
}
```

## Auth APIs

### POST /api/auth/register

注册。

Request:

```json
{
  "account": "test001",
  "password": "password",
  "inviteCode": "ABC123"
}
```

Rules:

- account 必填。
- password 必填。
- inviteCode 必填。
- 邀请码 status 必须为 unused。
- 注册成功后邀请码变为 used。
- 用户创建和邀请码更新必须事务化。

Error Cases:

- INVITE_CODE_REQUIRED
- INVITE_CODE_INVALID
- INVITE_CODE_USED
- INVITE_CODE_DISABLED
- ACCOUNT_ALREADY_EXISTS
- PASSWORD_INVALID

### POST /api/auth/login

登录。

Request:

```json
{
  "account": "test001",
  "password": "password"
}
```

Error Cases:

- ACCOUNT_OR_PASSWORD_INVALID

### POST /api/auth/logout

退出登录。

### GET /api/auth/me

获取当前用户。

## Project APIs

### GET /api/projects

获取当前用户自己的项目列表。

Rules:

- 必须登录。
- 只能返回当前用户的项目。

### POST /api/projects

创建项目。

Request:

```json
{
  "projectName": "姜老太熏肉卷饼",
  "profileText": "店铺资料大文本..."
}
```

Rules:

- 必须登录。
- projectName 必填。
- profileText 建议必填。
- userId 从 session 获取，不能信任前端传入。

### GET /api/projects/:id

查看项目详情。必须登录，只能查看自己的项目。

### PATCH /api/projects/:id

更新项目资料。

Request:

```json
{
  "projectName": "姜老太熏肉卷饼",
  "profileText": "更新后的店铺资料..."
}
```

Rules:

- 必须登录。
- 只能更新自己的项目。
- updatedAt 自动更新。
- 后续生成脚本必须使用最新 profileText。

### DELETE /api/projects/:id

删除项目。必须登录，只能删除自己的项目。

## Script Generation APIs

### POST /api/douyin/extract-transcript

根据抖音链接自动提取口播文案。

Request:

```json
{
  "douyinUrl": "https://www.douyin.com/video/xxxx"
}
```

Success:

```json
{
  "success": true,
  "data": {
    "originalTranscript": "自动提取出的口播文案"
  }
}
```

Failure 用户统一看到：

```text
当前链接无法自动提取，请更换可提取的抖音视频链接
```

Rules:

- 只支持抖音链接。
- 不支持小红书、视频号等链接。
- 不做手动粘贴兜底。
- 不允许硬抓取作为核心实现。
- Provider 必须是可替换的独立模块。
- 当前真实抖音口播 Provider 仍为 blocked；不可用时不返回假 `originalTranscript`。
- 未来合规 Provider 可以返回直接字幕，也可以返回可用于下游 ASR 的授权媒体 URL。
- 下游 ASR 只能处理合法媒体 URL 到文本，不能承担抖音链接解析、绕过平台限制或未授权媒体获取。
- 错误响应不得暴露第三方接口、密钥、堆栈、风控或内部 Provider 细节。
- Provider 由服务端环境变量 `DOUYIN_PROVIDER` 选择，可选 `blocked` / `asr` / `tikhub`，默认必须是 `blocked`。
- `asr` 模式只在服务端存在授权媒体 URL 和 ASR 配置时转写；缺配置时返回失败，不伪造 transcript。当前 `ASR_AUTHORIZED_MEDIA_URL` 仅用于本地/内部测试，生产链路必须由上游 Provider 基于当前 `douyinUrl` 返回对应授权媒体 URL。
- `tikhub` 模式默认关闭；只有 `DOUYIN_PROVIDER=tikhub` 且服务端配置 `TIKHUB_API_KEY` 和 `TIKHUB_API_BASE_URL` 时才会尝试调用。TikHub 当前只是测试 Provider 插槽，不标记为合规生产能力。
- ASR/TikHub 响应只接受明确语义字段：transcript 类字段必须是足够长度的文本；media URL 类字段必须是 `http://` 或 `https://` URL。普通 `message`、`requestId` 等字符串字段不能被当作口播文案或媒体 URL。
- P1-6 TikHub 测试模式要求额外配置 `TIKHUB_TEST_DOUYIN_URL`；未配置 Key/Base URL/Test URL 时不调用外部接口，只返回 not_configured/missing_test_url 类测试结论。测试结论只记录字段结构摘要，不输出完整响应、Key 或敏感 URL。
- P1-7 已将 TikHub 请求修正为 GET，路径摘要为 `/api/v1/douyin/web/fetch_one_video_by_share_url`，通过 `share_url` 查询参数传入链接。认证摘要确认 `Authorization: Bearer` 返回 200。最新真实调用返回结构摘要为 `transcript`，未返回 media URL，因此不需要 ASR。`desc` 不作为 transcript 字段，避免把视频描述伪装成口播文本。
- P1-8 多链接稳定性测试支持 `TIKHUB_TEST_DOUYIN_URLS`；本轮 5 条真实链接摘要结果为 transcript 4、media_url 0、unknown 1、provider_error 0，可进入 DeepSeek 拆解 4。API 不返回完整链接、完整响应、完整 transcript 或完整 media URL。
- P1-9 Retry 已用真实 HTTP/session 流程验证生成页依赖的提取、拆解、最终生成 API 链路。unknown/失败路径向用户展示固定失败提示，外部 Provider 内部失败对外统一为 `DOUYIN_TRANSCRIPT_UNAVAILABLE`，不暴露 TikHub/ASR 内部错误码。
- P1-10 Fix 已补充 TikHub 显式嵌套 media URL 路径解析，支持 `aweme_detail.video.play_addr.url_list`、`download_addr.url_list`、`play_addr_h264.url_list` 和明确音乐播放 URL 路径；`desc`、`title` 等描述性字段不能作为 transcript。单链接测试摘要为同时命中 transcript 与 media URL；本地 ASR 配置缺失时不执行转写，不伪造 transcript。
- P1-11 Fix 已将 ASR 转写逻辑改为火山 submit 格式：POST `VOLCENGINE_ASR_ENDPOINT`，Header 使用 `x-api-key`、`X-Api-Resource-Id`、`X-Api-Request-Id`、`X-Api-Sequence:-1`，Body 使用 `user`、`audio.url`、`request.model_name`。缺少 `VOLCENGINE_ASR_API_KEY` 时返回 `ASR_PROVIDER_NOT_CONFIGURED`；submit 只返回任务 id 时标记为 submitted，不伪造成 transcript。
- P1-11 Real Submit 已真实调用火山 submit：TikHub media URL 命中，火山 HTTP 返回成功，状态头显示 submit 已受理并返回 request id 摘要；未直接返回 transcript。当前 API 仍不会把 submitted 当作 `originalTranscript`，后续需要查询/轮询接口。
- P1-12 Fix 已按火山官方规则修正 query/poll：query endpoint 默认从 submit 推导 `/query`，也可用 `VOLCENGINE_ASR_QUERY_ENDPOINT` 覆盖；query 使用 `X-Api-Key`、`X-Api-Resource-Id`、`X-Api-Request-Id`，body 固定 `{}`，不发送 query 阶段 `X-Api-Sequence`。真实 query 已返回 transcript；无 transcript 或处理中状态仍不返回假 `originalTranscript`。
- P1-13 页面级回归中，提取 API 成功响应对前端只返回 `originalTranscript`，不再返回 `source` 或 `audioUrl`，避免浏览器侧暴露完整媒体 URL 或内部来源。
- P1-14 上线前收口：TikHub 请求增加服务端超时 `TIKHUB_REQUEST_TIMEOUT_MS`；火山 ASR submit/query 单次请求增加 `VOLCENGINE_ASR_REQUEST_TIMEOUT_MS`；火山 submit endpoint 支持 `VOLCENGINE_ASR_SUBMIT_ENDPOINT`，并兼容旧 `VOLCENGINE_ASR_ENDPOINT`。

### POST /api/scripts/analyze-reference

拆解参考脚本。

Request:

```json
{
  "originalTranscript": "自动提取出的原口播文案"
}
```

Success:

```json
{
  "success": true,
  "data": {
    "sections": [
      {
        "title": "开头共情钩子",
        "originalText": "对应原文片段",
        "startTime": "可选",
        "endTime": "可选"
      }
    ],
    "referenceStructure": [
      {
        "structureName": "开头共情钩子",
        "originalText": "对应原文片段"
      }
    ]
  }
}
```

Rules:

- 拆解必须基于原文。
- DeepSeek 原始拆解输出使用 sections，每段包含 title 和 originalText。
- API 同时返回 referenceStructure 兼容当前前端，每段包含 structureName 和 originalText。
- 顺序必须贴合原文顺序。
- 不允许脱离原文泛泛总结。
- 未配置 `DEEPSEEK_API_KEY` 时返回明确失败/blocked，不返回假拆解。
- DeepSeek 返回 JSON 不合法时返回用户可理解错误，不暴露内部堆栈或 Key。

### POST /api/scripts/generate-structure

已取消：当前产品流程不再单独输出商家版新脚本结构。

### POST /api/scripts/generate-final

按参考脚本结构、商家项目最新资料和时长生成完整口播文案。

Request:

```json
{
  "projectId": "project_id",
  "referenceStructure": [
    {
      "structureName": "开头共情钩子",
      "originalText": "对应原文片段"
    }
  ],
  "duration": "30-60"
}
```

duration 可选值：15-30、30-60、60-90。

Success:

```json
{
  "success": true,
  "data": {
    "finalScript": "完整新口播脚本文案"
  }
}
```

Rules:

- 必须登录。
- projectId 必须属于当前用户。
- 必须读取项目最新 profileText。
- referenceStructure 必须包含 structureName 和 originalText。
- 最终文案必须参考 referenceStructure 的顺序和表达功能。
- 生成文案必须符合用户选择的时长。
- 生成文案不能照搬参考视频原商家信息。
- 生成后不保存长期历史记录。
- 未配置 `DEEPSEEK_API_KEY` 时返回明确失败/blocked，不返回假 finalScript。
- DeepSeek 请求失败、超时或 JSON 不合法时返回用户可理解错误，不暴露内部堆栈或 Key。

## 爆款选题 API（V2，实施中，尚未上线）

批次生成使用 DeepSeek JSON object response format，并在服务端再次执行领域校验。脱敏诊断区分 JSON 语法、字段缺失/类型错误、数量错误、坐标错误、爆款元素越界和安全校验失败，同时记录 finish reason 与响应长度桶；不得记录商家正文、Prompt 或供应商原始响应。

任务创建接口必须在约 10 秒总截止内返回任务 ID 或明确的 `TOPIC_JOB_CREATE_TIMEOUT` / `TOPIC_JOB_CREATE_BUSY`，为前端 12 秒请求截止预留响应时间。客户端在响应丢失后必须沿用同一个 `clientRequestId` 重试，服务端通过唯一约束返回原任务，避免重复生成和重复扣额。过期任务清理由 Worker 承担，不放在创建请求关键路径。

### POST /api/topics/analyze

登录用户提交 `{ "projectId": "project_id" }`。服务端校验项目归属并读取最新 `profileText`，返回 `track`、正好5项 `keywords`、正好5项 `audienceScenes` 和 `projectUpdatedAt`。资料不足时返回可理解错误并引导补充主营产品、核心卖点、消费人群和消费场景；分析不扣每日生成额度。

### POST /api/topics/generate

请求包含 UUID `clientRequestId`、`projectId`、`analyzedProjectUpdatedAt`、`track`、正好5项且组内不重复的 `keywords` 与 `audienceScenes`。若项目更新时间已变化，返回 `PROJECT_PROFILE_CHANGED`，要求重新分析。相同用户重复提交同一个 `clientRequestId` 时返回原任务，不重复调用 AI。

接口只负责校验和创建持久任务，快速返回 `{ id, status: "queued" }`。独立 Topic Worker 读取任务后，按 `userId + projectId` 重新读取最新商家资料并生成结果；商家正文不写入任务记录，也不与抖音提取 Worker 共用并发池。

Topic Worker 使用独立 Node/tsx server-runtime 模块，不加载只适用于 Next.js 模块图的 `server-only` 哨兵；API 路由仍通过带 `server-only` 的门面模块访问同一实现，防止服务端能力进入 Client Component。CI 与部署必须通过 Worker 功能检查后才可发布。

### GET /api/topics/generate/:jobId

仅任务所属用户可轮询。`queued`、`processing` 返回当前状态；成功响应包含：

- `ideas`：正好25条，覆盖唯一且完整的5×5坐标；每条含 `keywordIndex`、`audienceSceneIndex`、对应文本、`title`、`opening`、`hook`、1—2项 `viralElements` 和 `viralElementReason`，不含脚本类型。
- `topPicks`：正好3条，`objective` 分别为 `traffic`、`trust`、`conversion`；三条坐标存在于 `ideas` 且互不重复，并包含 `reason`、`shootingDifficulty`（`low|medium|high`）、`requiredMaterials`、`suggestedScene`、`riskNote`。

规则：爆款元素只能来自成本、借势、对立、幕后、反差、猎奇、人群、怀旧、糟糕、性感；必须执行产品安全改写。Worker 按5个消费场景串行生成5个批次，每批严格返回该场景×5个关键词的5条 ideas；完成25条并做全局坐标、标题唯一和安全复验后，再用不含商家正文的精简选题索引单独生成Top 3。批次Prompt提供固定JSON形状并限制短字段；每次请求上限22秒，空响应、截断JSON或非法JSON使用针对性提示最多重试一次，最坏264秒，低于5分钟任务期限。每个批次开始前重新确认任务仍由当前Worker持锁，取消或超时后不再发起后续AI调用。fenced JSON 与普通 JSON 使用同一安全提取结果完成底层校验和领域解析。任一批次仍出现非法 JSON、缺项、重复、越界或安全违规即整体失败，不返回或落库半成品；仅当两次semantic都因标题重复且重复项为1至5条时，才对该批次全部违规项执行一次性修复请求，保留合规项并重新执行完整批次校验，修复请求受45秒及任务剩余guard约束且maxTokens按项数计算并封顶2500。日志仅记录安全错误分类、batchIndex、attempts、semanticAttempts、finishReason、responseLengthBucket、parseError、duplicateRepairStage、duplicateScope、duplicateCountBucket和uniquePreservedCountBucket，不记录标题、坐标值、关键词、场景、商家正文或ID。只有完整25条与Top 3通过最终组装校验时，才在同一个 Serializable 事务落库并扣1次额度。错误响应不得暴露 Prompt、商家资料、模型原始输出、密钥或供应商内部信息。

### GET /api/topics/generate/active

返回当前登录用户唯一的 `queued` 或 `processing` 任务；没有活动任务时返回 `null`。响应只包含恢复页面所需的项目 ID、赛道、5个关键词、5个消费场景、创建时间和运行截止时间，不包含商家正文。刷新或重新进入页面后据此恢复轮询，其他用户的任务不可见。

### DELETE /api/topics/generate/:jobId

仅所属用户可取消尚未扣额度的 `queued` 或 `processing` 任务。取消条件更新为 `canceled` 终态并清空输入、结果和 Worker 锁；成功或已扣额度任务不可取消。取消与 Worker 完成并发时只能有一个终态获胜，失锁 Worker 不得写结果或扣额度。

## 定制化脚本 API（V2，规划中，尚未实现）

定制化脚本固定使用持久 `CustomScriptGenerationJob` 与独立 Worker。HTTP 创建接口不等待 DeepSeek；页面通过任务接口轮询并在刷新后恢复最新未过期任务。以下所有成功响应统一使用 `{ "success": true, "data": ... }` 包装。

### POST /api/scripts/generate-custom

Request:

```json
{
  "clientRequestId": "uuid",
  "projectId": "project_id",
  "sourceProjectId": "粘贴选题携带时传入；自由需求或无ID旧文本省略",
  "sourceType": "topic | top_pick；自由需求或无官方头旧文本省略",
  "sourceObjective": "粘贴官方选题时传入；自由需求或无官方头旧文本省略",
  "requestText": "自由需求或粘贴的爆款选题方案",
  "objective": "auto",
  "tone": "auto",
  "previousScript": "仅换一版时传入"
}
```

字段与枚举：

- `objective`: `auto | traffic | trust | conversion`
- `tone`: `auto | natural | professional | emotional`
- `sourceType`: `topic | top_pick`，仅官方选题头存在时传入。
- `sourceObjective`: `auto | traffic | trust | conversion`，仅官方选题头存在时传入，用于来源校验与界面初始化，不限制用户最终 `objective`。
- `requestText`: 去除首尾 Unicode whitespace 后5—5000 Unicode code points。
- `previousScript`: 可选，最多1000 Unicode code points。
- `sourceProjectId`: 可选，最多64 Unicode code points。

新任务成功返回 HTTP 202：

```json
{
  "success": true,
  "data": {
    "id": "job_id",
    "status": "queued",
    "createdAt": "ISO时间",
    "runDeadlineAt": "ISO时间"
  }
}
```

同一 UUID 同 payload 的幂等重放返回原 Job 快照，不创建新任务、不重复计小时限制或每日额度；同一 UUID 不同 payload 返回 HTTP 409 `CUSTOM_SCRIPT_IDEMPOTENCY_CONFLICT`。

### 官方选题头解析

普通选题和 Top 3 的复制文本必须从首个非空行开始使用以下五行，按顺序各出现一次：

```text
【脚本工坊爆款选题】
sourceProjectId: <项目ID>
sourceType: <topic|top_pick>
sourceObjective: <auto|traffic|trust|conversion>
商家项目：<项目名称>
```

- 五行官方头结束后，选题正文从第六行开始。
- 首个非空行之前只允许由 Unicode `White_Space` 或 FEFF 组成的空白行；标识或保留机器字段出现在此前区域仍返回 `CUSTOM_SCRIPT_INPUT_INVALID`。
- 复制时把项目名称中的 CR、LF、U+2028、U+2029 替换为空格，再把连续 Unicode whitespace 收敛为单个 ASCII 空格并 trim。项目名称仅展示，不参与授权或相等判断。
- `sourceType=topic` 时 `sourceObjective=auto`；`sourceType=top_pick` 时 `sourceObjective` 必须为 `traffic|trust|conversion`。Top 3 不从中文目标标签推断来源目标。
- 服务端必须从原始 `requestText` 独立解析官方头，并与 body 的 `sourceProjectId`、`sourceType`、`sourceObjective` 逐项交叉核对。
- `sourceObjective` 与 body 一致后只作为来源元数据；用户实际选择的 `objective` 可以不同，服务端不得要求二者相等。
- 官方标识或保留机器字段 `sourceProjectId:`、`sourceType:`、`sourceObjective:` 只能出现在正确五行头的对应位置；出现在正文或其他位置时返回 `CUSTOM_SCRIPT_INPUT_INVALID`。
- 官方头字段空、缺、重复、非法、顺序错误、交叉核对不一致或项目展示行缺失时返回 `CUSTOM_SCRIPT_INPUT_INVALID`。
- 来源 ID 不存在、不属于当前用户或不等于 `projectId` 时统一返回 `CUSTOM_SCRIPT_PROJECT_SOURCE_MISMATCH`，不得泄露项目归属。
- 只有全文完全不含官方标识和三个保留机器字段时，才按无官方头的自由需求/旧版/外部文本处理；此时 body 的 `sourceProjectId`、`sourceType` 和 `sourceObjective` 必须省略。

### GET /api/scripts/generate-custom/current

页面 mount 时调用。返回当前用户最新且未过30分钟终态 TTL 的单个 Job 快照，覆盖 `queued|processing|succeeded|needs_profile|failed|canceled`；按创建时间倒序取一条，不返回列表。没有符合条件的任务时返回：

```json
{
  "success": true,
  "data": null
}
```

快照不得包含商家正文、用户要求、上一版正文、Prompt 或模型原始响应。终态也可在 TTL 内恢复；本功能不提供历史列表。

### GET /api/scripts/generate-custom/:jobId

仅 Job 所属用户可读。`queued|processing` 返回状态和截止时间；终态在30分钟 TTL 内返回安全结果或错误分类。

成功终态：

```json
{
  "success": true,
  "data": {
    "id": "job_id",
    "status": "succeeded",
    "createdAt": "ISO时间",
    "runDeadlineAt": "ISO时间",
    "finishedAt": "ISO时间",
    "expiresAt": "ISO时间",
    "result": {
      "status": "success",
      "finalScript": "完整口播正文（创作目标约200—350字）",
      "characterCount": 292,
      "inputType": "brief"
    }
  }
}
```

`inputType` 可选值为 `brief | topic | top_pick`，仅表示确定性输入识别结果，不改变服务端事实来源。

资料不足终态：

```json
{
  "success": true,
  "data": {
    "id": "job_id",
    "status": "needs_profile",
    "result": {
      "status": "needs_profile",
      "missingFacts": ["promotion", "service_process"]
    }
  }
}
```

`missingFacts` 必须为1—5个互不重复的固定缺失资料码，只能来自：

```text
main_product
core_selling_point
target_audience
consumption_scene
price
promotion
address_or_service_area
service_process
qualification
proof_or_case
effect_claim
production_process
materials_or_ingredients
service_action
business_hours
contact_method
business_data
warranty_or_after_sales
```

以上18项的唯一中文映射为：`main_product`→主营产品、`core_selling_point`→核心卖点、`target_audience`→目标人群、`consumption_scene`→消费场景、`price`→价格、`promotion`→活动、`address_or_service_area`→地址或服务区域、`service_process`→服务流程、`qualification`→资质、`proof_or_case`→证据或案例、`effect_claim`→效果依据、`production_process`→生产或制作流程、`materials_or_ingredients`→材料、原料或成分、`service_action`→服务动作、`business_hours`→营业时间、`contact_method`→联系方式、`business_data`→经营数据、`warranty_or_after_sales`→质保或售后。模型只返回 code；服务端按该白名单校验，未知码使整个模型输出无效；前端只使用本地中文映射，不得直接展示 AI 自由文本，也不得回显商家正文、用户输入或模型解释。

### DELETE /api/scripts/generate-custom/:jobId

仅 Job 所属用户可取消尚未扣额的 `queued|processing` 任务。取消使用条件更新写入 `canceled`，同时清空输入、结果和 Worker 锁；成功响应：

```json
{
  "success": true,
  "data": {
    "id": "job_id",
    "status": "canceled"
  }
}
```

取消与 Worker 完成竞争时只能有一个条件更新获胜。已经进入其他终态或已经扣额时不可取消；失锁 Worker 后续不得写入终态、结果或额度。

### CustomScriptGenerationJob 持久契约

- `(userId, clientRequestId)` 唯一；`inputHash` 在输入清除后保留。哈希前对每个文本执行 NFC、CRLF/CR→LF、trim，合法枚举保持原值；固定执行 `JSON.stringify([projectId,requestText,objective,tone,previousScript||'',sourceProjectId||'',sourceType||'',sourceObjective||''])`，再取 SHA-256。`clientRequestId` 不参与 `inputHash`。
- 同一用户最多一个 `queued|processing` Job；创建、认领、完成和超时使用事务或条件更新防竞态。
- `runDeadlineAt = createdAt + 120s`；Worker 超过截止时间不得继续调用 Provider 或写入成功。
- `finishedAt` 后 `expiresAt = finishedAt + 30min`；终态 Job 由 Worker 清理，不提供历史查询。
- Job 可在活动期保存生成所需的 `projectId`、来源字段、要求、目标、风格和上一版；进入 `succeeded|needs_profile|failed|canceled` 任一终态时立即清空所有输入字段。任务超时使用 `failed` 状态与 `CUSTOM_SCRIPT_RUN_TIMEOUT` 错误分类，不增加 `timed_out` 状态。
- 商家 `profileText` 必须由 Worker 按 `userId + projectId` 在运行时读取，绝不写入 Job。
- 成功正文或合法 `missingFacts` 最多保留至终态 TTL；Prompt、模型原始响应和商家正文任何时候都不入 Job。
- Job 持久化 `providerCallsStarted` 和 `semanticAttempt`。首次返回80—199安全稿时，Worker必须先在 `processing + lockedBy + runDeadlineAt + providerCallsStarted=1` 条件下把严格内部 `{status:"quality_fallback",finalScript,characterCount,inputType}` 写入 `CustomScriptGenerationJob.result`，再原子递增 `providerCallsStarted` 并写入对应 `semanticAttempt` 以预留第二次Provider调用。processing公共API不得返回fallback正文，公共serialize只识别正式终态结果。
- Worker 锁30秒失效并每10秒发送心跳。质量调使用40秒总预留，覆盖完整30秒租约恢复窗口、约1.5秒Worker轮询、数据库余量和至少5秒成功事务；剩余时间不超过40秒时直接提交fallback。新Worker重领时，`providerCallsStarted=1`且fallback合法可继续一次增强；`providerCallsStarted=2`且fallback合法不得调用第三次Provider，必须直接完成fallback。耗尽且无合法fallback的任务保持失败。旧Worker失锁后，终态、结果和扣额条件更新必须因lock token不匹配而失败。
- 成功 `result`、`quotaChargedAt` 和上海时区当日 `DailyUsage.scriptsGenerated + 1` 在同一个 Serializable 事务重新检查每日额度并提交。

Rules:

- 必须登录；`projectId` 必须属于当前用户，服务端每次读取最新 `profileText`，前端不得提交商家正文。
- POST 创建新 Job 前调用 `assertDailyScriptQuota` 快速拒绝已经无每日额度的请求；Worker 成功 Serializable 事务内再次检查每日额度，防止并发定制任务或其他脚本功能在运行期间耗尽额度。
- 每个新建 Job 立即占用定制化脚本独立的每用户每小时10次限制；`needs_profile`、失败和超时仍计小时次数。幂等重放不重复计数，未通过登录/基础输入校验且未创建 Job 的请求不计新任务。
- 每日额度继续使用 `dailyScriptLimit` / `scriptsGenerated`，仅成功终态扣1次；`needs_profile`、失败、超时和取消不扣每日额度。
- 商家最新资料是唯一商业事实来源；用户要求、粘贴选题和 `previousScript` 均为不可信创作输入，不能覆盖系统规则或补充商家事实。
- `previousScript` 只用于换一版差异校验；新版本必须更换开篇和主要表达角度。
- 客户端必须把一次待确认提交视为不可拆分的幂等载荷：`clientRequestId`、全部生成条件和可选 `previousScript` 必须一起保存和重放。网络响应不明确时不得只复用 UUID 而重新读取当前界面字段；条件变化或上一动作已经收到服务端响应后必须创建新 UUID。服务端对相同 UUID + 相同输入哈希返回原任务，对相同 UUID + 不同输入返回 `CUSTOM_SCRIPT_IDEMPOTENCY_CONFLICT`。
- AI 只允许返回 `success + finalScript` 或 `needs_profile + missingFacts`；`missingFacts` 只能使用固定白名单码，不得返回分析过程或自由文本。
- 前后端统一复用 `lib/custom-scripts/text.ts`：依次执行 NFC、CRLF/CR→LF 和边界 trim；边界 trim 去除 FEFF。正文计数只移除 Unicode `White_Space` 后按 Unicode code points 计数，内部 FEFF 不移除并计1，中文、英文、数字和标点各计1。页面创作目标约200—350字，Prompt目标为240—300；服务端内部安全范围为80—350 inclusive。80—199安全稿先成为内部 `quality_fallback`，可选质量增强不能破坏其最终成功；低于80才进入长度修复。
- 服务端医疗语义按整句逐个病名判断：明确诊断必须拒绝，真正的科普问句、预防、不确定表达和医疗转介允许；问句豁免只作用于当前病名所在分句，不能洗白同句其他病名的明确诊断。CTA计数前仅移除指向医生、医师、皮肤科或就医的明确转介短语，`咨询我们`、`咨询门店`、`到店咨询`仍是营销CTA。句尾建议咨询医生不能洗白前面的明确诊断。商家高风险断言必须同时出现可信商家主体、肯定能力动词和该动词后的高风险事实；单字“有”到风险事实最多间隔2字，其他能力动词最多间隔6字。主体包括固定门店称呼、服务端可信项目名称及去常见后缀后不少于2字的品牌名。普通“有人问/怎么选/如何判断/科普/了解”和“没有使用/未配备”等否定能力表达不属于能力断言；能力断言只有在最新 `merchantProfileText` 有对应依据时允许，项目名称本身不是医疗或功效依据。
- 取消、失败和所有终态清理都必须移除内部fallback；成功事务用正式结果替换fallback并只扣一次额度。并发取消已获胜时，恢复Worker不得完成fallback。
- 允许自然段落和任意换行；同一段可包含多句，一句话也可跨行，不限制单句长度或总行数，服务端不得按标点自动拆句。正文整体必须至少包含一个 Unicode 字母或数字，纯空白或纯标点无效。
- Provider 调用使用 `deepseek-v4-flash`、禁用思考，并显式传 `maxAttempts=1` 关闭传输/envelope retry。语义最多2次（首次 + 一次空响应/非法JSON/领域校验修复），共享120秒 Job 截止时间，每次使用剩余预算，总 Provider 调用最多2次。
- 连续两次 `empty_content`（HTTP/JSON envelope 成功但模型 `content` 为空）最终固定为 `CUSTOM_SCRIPT_OUTPUT_INVALID`，不归类为 Provider 不可用。只有网络错误、Provider 请求超时或 HTTP 失败归类为 `CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE`；Job 到达120秒 `runDeadlineAt` 仍返回 `CUSTOM_SCRIPT_RUN_TIMEOUT`。
- 商家资料、用户要求等不可信输入必须用 `JSON.stringify` 或等价安全 JSON 序列化进入模型消息；禁止拼接可被输入闭合的 XML/伪标签。
- 重试后仍不合格则失败，不返回半成品。

Error Cases:

- `CUSTOM_SCRIPT_INPUT_INVALID`
- `CUSTOM_SCRIPT_PROJECT_SOURCE_MISMATCH`
- `CUSTOM_SCRIPT_IDEMPOTENCY_CONFLICT`
- `CUSTOM_SCRIPT_ALREADY_RUNNING`
- `CUSTOM_SCRIPT_HOURLY_LIMIT_REACHED`
- `CUSTOM_SCRIPT_DAILY_LIMIT_REACHED`
- `CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE`
- `CUSTOM_SCRIPT_OUTPUT_INVALID`
- `CUSTOM_SCRIPT_RUN_TIMEOUT`

日志只能记录脱敏标识、耗时、长度/Token/缓存命中桶、重试原因、错误分类和扣额状态；不得记录商家正文、用户要求、选题、上一版、生成正文、Prompt、原始模型响应、密钥或明文用户/项目ID。
