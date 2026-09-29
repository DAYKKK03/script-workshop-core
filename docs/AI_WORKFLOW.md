# AI_WORKFLOW.md

## AI 工作流目标

以「参考脚本结构」为骨架，以「所选商家项目最新资料」为内容来源，生成新的本地生活短视频口播脚本。

## DeepSeek 接入配置

- OpenAI compatible baseURL：`https://api.deepseek.com`。
- API Key 只从服务端环境变量 `DEEPSEEK_API_KEY` 读取。
- 本地开发应放在 `.env.local` 或本机 `.env`，线上部署应放在平台 Secret/Environment Variables。
- 不允许使用 `NEXT_PUBLIC_DEEPSEEK*`，不允许把 Key 放入前端 bundle、localStorage、cookie、页面脚本变量或浏览器请求参数。
- 网站用户不需要也不应该配置 DeepSeek Key；后端 API 统一使用服务端 Secret 调 DeepSeek。
- 模型从 `DEEPSEEK_MODEL` 读取，默认 `deepseek-v4-flash`。
- 未配置 `DEEPSEEK_API_KEY` 时，API 返回明确 blocked/失败状态，不生成 mock 结果。
- DeepSeek 请求失败、超时或返回 JSON 不合法时，只返回用户可理解错误，不暴露 Key、堆栈或内部接口。

## 硬性限制

1. 不允许照搬参考脚本原文。
2. 不允许沿用参考视频原商家的店名、地址、菜品、活动、卖点。
3. 新内容必须来自所选商家项目资料。
4. 如果商家项目资料不足，尽量基于已有资料生成，不允许虚构具体价格、活动、地址、资质。
5. 参考脚本拆解必须输出「结构名称 + 对应原文片段」。
6. 拆解必须忠实于原文顺序。
7. 第一版不做站内编辑，不保存历史记录。
8. 抖音口播提取不是 AI 自己猜，必须来自自动提取能力返回的原始文案。

## Service 1：douyinTranscriptService

作用：输入抖音链接，返回自动提取出的口播文案。

输入：

```json
{
  "douyinUrl": "https://www.douyin.com/video/xxxx"
}
```

输出成功：

```json
{
  "originalTranscript": "自动提取出的口播文案"
}
```

输出失败：

```json
{
  "message": "当前链接无法自动提取，请更换可提取的抖音视频链接"
}
```

实现约束：

- 必须使用安全、合规的提取能力。
- 不允许硬抓取作为核心实现。
- 不允许手动粘贴兜底。
- Provider 暂不可用时，可以先实现接口并返回失败，但不能伪装真实提取成功。

Provider 选择：

- `DOUYIN_PROVIDER=blocked`：默认值，稳定返回失败，不生成假文案。
- `DOUYIN_PROVIDER=asr`：服务端读取 `ASR_AUTHORIZED_MEDIA_URL`，再调用 `ASR_API_BASE_URL` + `ASR_API_KEY` 将授权媒体 URL 转成文本。缺少任一配置时返回 blocked。`ASR_AUTHORIZED_MEDIA_URL` 只用于本地/内部测试链路，不是生产抖音链接解析路径。
- `DOUYIN_PROVIDER=tikhub`：测试 Provider 插槽，仅在显式设置 provider 且配置 `TIKHUB_API_KEY` + `TIKHUB_API_BASE_URL` 时尝试。默认关闭，不代表已确认合规生产能力。

Provider 返回结构：

- 直接 transcript：返回 `originalTranscript`，进入 DeepSeek 拆解。
- `authorizedMediaUrl` / `audioUrl`：仅作为合法授权媒体 URL 交给 ASR 转写，再进入 DeepSeek 拆解。
- blocked/error：返回固定用户提示，不产生假 `originalTranscript`。

### 合规提取链路调研结论

当前可接受链路：

1. 抖音链接进入 `douyinTranscriptProvider`。
2. 合规上游 Provider 在授权和商用条款允许范围内返回字幕/口播文案，或返回可用于 ASR 的授权音频/视频 URL。
3. 如果上游只返回授权媒体 URL，才进入下游 ASR，将合法媒体 URL 转成文本。
4. 得到的原口播文案再进入 `analyzeReferenceScript`。

当前不可接受链路：

- 不调用抖音非公开接口。
- 不做签名逆向、模拟登录、使用用户 Cookie、绕过验证码或风控。
- 不下载无水印视频或未授权音频。
- 不接灰产解析接口。
- 不把手动粘贴或上传作为第一版兜底。

公开资料核对结果：

- 抖音开放平台公开 OpenAPI 列表包含授权、用户公开信息、视频基础信息、IFrame、搜索、生活服务等能力，但本轮未发现“任意抖音链接直接提取口播/字幕/音频”的官方接口。
- 合规第三方 Provider 必须提供正式接口文档、商用条款、授权来源说明、错误码说明，并明确是否返回字幕文本、授权媒体 URL、来源标识以及是否需要账号授权。
- 火山 ASR 适合作为下游能力：处理“合法音频/视频 URL 或授权媒体文件 -> 文本”。它不能单独解决“抖音链接 -> 音频/字幕”的上游获取问题。
- 当前第一版产品状态应表达为：只支持可被合规 Provider 自动提取的抖音链接；Provider 不可用时展示固定失败提示。

P1-5 当前状态：

- 默认 Provider 仍为 `blocked`，真实抖音自动提取不是默认已完成能力。
- ASR 链路已预留为服务端能力：授权媒体 URL + ASR -> transcript -> DeepSeek 拆解/生成。本地未配置 ASR Key/URL 时保持 blocked。
- 生产 ASR 链路必须由上游 Provider 基于当前 `douyinUrl` 返回对应授权媒体 URL，再进入 ASR；不能用全局固定媒体 URL 代表真实抖音解析。
- TikHub 仅作为测试模式插槽，默认关闭；需补齐材料确认后，才能评估是否可作为正式 Provider。

P1-6 测试模式：

- TikHub 测试模式只在服务端同时满足 `DOUYIN_PROVIDER=tikhub`、`TIKHUB_API_KEY`、`TIKHUB_API_BASE_URL`、`TIKHUB_TEST_DOUYIN_URL` 时调用。
- 测试模式只记录结构摘要：`transcript`、`media_url`、`unknown` 或 `not_configured`，不记录完整原始响应、Key 或带敏感参数的 URL。
- 当前本地环境未配置 TikHub Key/Base URL/Test URL，因此真实 TikHub 调用未执行，结构状态为 `not_configured`。
- 如果 TikHub 返回 transcript/caption/text 且通过长度校验，可进入 DeepSeek 拆解；如果只返回合法 http/https media URL，则进入 ASR；无 ASR Key 时必须 fixed failure，不生成假 transcript。

P1-7 真实 TikHub 测试调用：

- 本地服务端 TikHub 测试配置已存在，真实测试调用已执行。
- TikHub 请求方式已修正为 GET，路径摘要：`/api/v1/douyin/web/fetch_one_video_by_share_url`，使用 `share_url` 查询参数传入测试链接或用户输入链接。
- `desc` 不作为口播 transcript 使用，避免视频描述被伪装成口播文案。
- 认证方式摘要：`Authorization: Bearer` 返回 200；直接 `Authorization` 和 `X-API-Key` 返回 401。
- 返回结构摘要：`transcript`；未命中合法 media URL，因此不需要 ASR。
- `/api/douyin/extract-transcript` 在 TikHub 测试配置下已返回 `originalTranscript`；DeepSeek 拆解和最终生成已做摘要验证。

P1-8 多链接稳定性测试：

- 输入来源支持 `TIKHUB_TEST_DOUYIN_URLS` 多链接；本轮使用用户补充的 5 条真实分享链接做摘要测试。
- 测试链接数量：5。
- transcript 成功数量：4；media_url 数量：0；unknown 数量：1；provider_error 数量：0。
- 可进入 DeepSeek 拆解数量：4。
- 抽样 DeepSeek 拆解 2 条，sections/referenceStructure 摘要分别为 2/2、1/1。
- 当前 transcript 成功率较高，建议进入 P1-9 页面真实流程接入测试，同时保留 unknown 结构的失败提示和日志摘要。

P1-9 页面真实流程接入复测：

- 生成页源码已确认调用真实 `/api/douyin/extract-transcript`、`/api/scripts/analyze-reference`、`/api/scripts/generate-final` 链路。
- 参考结构区域展示 `structureName` 和 `originalText`，不展示假结构。
- 最终文案生成后才展示复制按钮，复制使用浏览器剪贴板并提供成功/失败反馈。
- `/generate` 服务端页面继续通过 `requireUser()` 保护，项目列表来自 `listProjects(user.id)`。
- Retry 已通过真实 HTTP/session 流程完成：临时用户注册登录、创建临时商家项目、访问 `/generate`、成功链接提取 transcript、DeepSeek 拆解、15-30 秒最终文案生成均成功。
- Retry 摘要：transcript 长度 13；referenceStructure 1 段；最终文案长度 64，并命中所选项目资料；unknown 链接返回 503 和固定失败提示；非当前用户项目生成返回失败。
- 本轮发现并修复提取 API 错误码暴露风险：Provider 内部失败对外统一为 `DOUYIN_TRANSCRIPT_UNAVAILABLE`，用户文案仍固定。
- 可视化补验已完成：浏览器页面注册临时用户、创建临时项目、进入生成页、提取并拆解成功、最终文案生成后复制按钮出现，实际点击复制按钮后显示“已复制到剪贴板”。不可提取链接页面展示固定失败提示，未暴露内部接口或 Key。

P1-10 单链接资源与 ASR POC：

- TikHub transcript 白名单继续排除 `desc`、`title`、`share_desc`、`nickname` 等描述性字段，避免把视频描述或标题伪装成口播文案。
- TikHub media URL 解析已补充显式嵌套路径，包括 `aweme_detail.video.play_addr.url_list`、`download_addr.url_list`、`play_addr_h264.url_list` 和明确的音乐播放 URL 路径；只接受 `http://` / `https://`。
- 用户提供的单条链接测试摘要：TikHub 同时命中 transcript 和 media URL；主链路仍优先使用 transcript 进入后续拆解，不强制 ASR。
- 当前本地未配置火山/豆包 ASR 服务端环境变量，因此媒体转写链路状态为 `ASR_NOT_CONFIGURED`；未执行 ASR 调用，也未生成假转写结果。

P1-11 火山/豆包 ASR Provider POC：

- 已新增服务端 ASR Provider POC 模块，将原授权媒体 URL 转写逻辑收敛到 `lib/asr/volcengine-asr-provider.ts`；只读取服务端环境变量，不进入前端。
- P1-11 Fix 已按用户提供的 curl 示例改为火山 submit 格式：POST `VOLCENGINE_ASR_ENDPOINT`，使用 `x-api-key`，`X-Api-Resource-Id`，`X-Api-Request-Id`，`X-Api-Sequence: -1`，body 使用 `user` / `audio.url` / `request.model_name` 结构。
- 当前服务端变量：`VOLCENGINE_ASR_ENDPOINT`、`VOLCENGINE_ASR_RESOURCE_ID`、`VOLCENGINE_ASR_MODEL` 已有本地默认值；`VOLCENGINE_ASR_API_KEY` 仍缺失。
- mock submit 成功响应已验证：submit 返回 task id 时标记为 `submitted`，不会伪装成 transcript；HTTP 失败会返回失败摘要。
- Real Submit：本地 `VOLCENGINE_ASR_API_KEY` 已配置后，TikHub media URL 命中，火山 submit 已真实调用；HTTP 层成功，火山状态头为受理成功并返回 request id 摘要。
- 本次 submit 未直接返回 transcript，响应体也未返回可用 task id；当前 Provider 将这种受理态标记为 `submitted`，不会伪装成转写成功。下一步需要火山查询/轮询接口才能拿 transcript。

P1-12 火山 ASR 查询/轮询 POC：

- Provider 已支持 submit 后自动推导 `/query` endpoint，也支持 `VOLCENGINE_ASR_QUERY_ENDPOINT` 覆盖；query 使用 submit 返回的同一个 request id、相同 `X-Api-Key` 和 `X-Api-Resource-Id`，body 固定 `{}`，query 阶段不发送 `X-Api-Sequence`。
- query/poll 有有限次数和间隔控制：`VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS`、`VOLCENGINE_ASR_QUERY_INTERVAL_MS`。
- mock query 成功已验证：query 返回明确 transcript/text/result/utterances 字段时可解析 transcript。
- P1-12 Fix 已按官方状态码处理：`20000000` 且 `result.text` 成功；`20000001` / `20000002` 继续轮询；其他状态码失败摘要。
- 真实链路摘要：TikHub media URL 命中，火山 submit 被受理，query 成功返回 transcript，长度摘要 1058；DeepSeek 拆解成功 9 段，最终生成成功，长度摘要 116。

P1-13 页面级真实流程回归：

- 当 TikHub 同时返回短 transcript 和 media URL 时，服务端优先进入 ASR，避免短标题类文本被当作完整口播文案。
- 提取 API 面向前端只返回 `originalTranscript`；`source` 和完整媒体 URL 保留在服务端链路中，不返回给浏览器页面。
- ASR query 默认轮询 15 次、每次间隔 3 秒，可通过 `VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS` 和 `VOLCENGINE_ASR_QUERY_INTERVAL_MS` 覆盖。
- 真实 session/API 回归摘要：登录态 `/generate` 可加载当前用户项目；TikHub media URL -> 火山 ASR -> DeepSeek 拆解/生成链路通过；失败链路仍只展示固定可理解错误。

P1-14 上线前稳定性收口：

- TikHub 单次请求有服务端超时边界，默认 15 秒，可通过 `TIKHUB_REQUEST_TIMEOUT_MS` 覆盖。
- 火山 ASR submit/query 单次请求有服务端超时边界，默认 30 秒，可通过 `VOLCENGINE_ASR_REQUEST_TIMEOUT_MS` 覆盖。
- 火山 submit endpoint 优先读取 `VOLCENGINE_ASR_SUBMIT_ENDPOINT`，兼容旧变量 `VOLCENGINE_ASR_ENDPOINT`；query endpoint 继续读取 `VOLCENGINE_ASR_QUERY_ENDPOINT` 或从 submit endpoint 推导。
- 页面提交和生成 handler 增加处理中 guard，按钮处于处理中时不会重复触发同一流程。
- 部署前配置、验证、回滚和 Provider 禁用步骤见 `docs/DEPLOYMENT_CHECKLIST.md`。

## Service 2：analyzeReferenceScript

作用：拆解自动提取出的参考口播文案。

输出格式：

```json
{
  "sections": [
    {
      "title": "开头共情钩子",
      "originalText": "对应原文片段",
      "startTime": "可选",
      "endTime": "可选"
    },
    {
      "title": "场景/痛点引入",
      "originalText": "对应原文片段"
    }
  ]
}
```

Prompt 要求：

```text
你是本地生活短视频编导。

请拆解下面这条自动提取出的抖音口播文案。

要求：
1. 必须严格基于原文拆解。
2. 必须按原文出现顺序拆解。
3. 输出格式必须是 JSON。
4. 每个结构必须包含 title 和 originalText。
5. originalText 必须是原文中的连续或基本连续片段。
6. 不允许脱离原文泛泛总结。
7. 不允许新增原文没有的信息。
8. 不要求固定五段，如果原文结构更多或更少，可以按实际原文拆。
9. 结构名称要贴合短视频脚本功能，例如：开头钩子、痛点引入、场景铺垫、产品介绍、活动说明、信任强化、结尾引导等。
```

## Service 3：generateNewStructure

已取消：当前产品流程不再单独输出商家版新脚本结构。

## Service 4：generateFinalScript

作用：根据参考脚本结构、商家项目最新资料和用户选择的时长，直接生成完整口播文案。

时长约束：

| 时长选项 | 建议字数 |
|---|---|
| 15-30 秒 | 80-150 字 |
| 30-60 秒 | 180-300 字 |
| 60-90 秒 | 320-500 字 |

输出格式：

```json
{
  "finalScript": "完整新口播脚本文案"
}
```

Prompt 要求：

```text
你是本地生活短视频口播脚本编导。

请根据参考脚本结构和商家项目资料，生成一条完整口播文案。

要求：
1. 必须参考 referenceStructure 的顺序和每段表达功能。
2. 内容必须来自商家项目资料。
3. 不允许沿用参考视频原商家的店名、地址、菜品、套餐、活动、卖点。
4. 不允许虚构具体价格、活动、地址、资质、承诺。
5. 语言口语化，适合抖音本地生活短视频。
6. 根据用户选择的时长控制字数：15-30 秒 80-150 字；30-60 秒 180-300 字；60-90 秒 320-500 字。
7. 输出 JSON，只包含 finalScript。
```

## AI 输出校验

analyzeReferenceScript：DeepSeek 原始输出使用 sections 数组；每一项都有 title 和 originalText；originalText 不能为空；originalText 必须能在原口播文案中找到高度相似片段。API 可同时返回 referenceStructure 兼容现有前端。

generateNewStructure：已取消，不再单独校验或输出。

generateFinalScript：referenceStructure 是数组；每一项都有 structureName 和 originalText；projectId 必须属于当前用户；后端必须读取项目最新 profileText；finalScript 非空；字数应大致符合时长范围，服务层使用小幅容差避免真实模型输出因轻微偏差被误判；不包含参考视频原商家的明显专有信息；不包含空泛占位符，例如“某某店”“你的店铺”“这里填写活动”。如果最终脚本长度明显不合格或明显复制参考原文长片段，服务最多重新请求一次；仍不合格则返回失败。

P1-10 60-90 秒质量调优：

- 针对短参考结构容易生成偏短的问题，60-90 秒 prompt 已加强为 14-18 个口播句，目标 360-430 个中文字符。
- 当参考结构少于 3 段时，服务会明确要求在保持结构功能顺序的前提下，围绕项目资料扩展到店场景、菜品体验、适合人群、环境/服务感受和结尾引导。
- 60-90 秒长度校验下限从原 80% 容差收紧为 90% 容差，低于约 288 个中文字符会触发重试或失败。
- 真实验证摘要：短参考结构 60-90 秒生成成功，长度 343，命中项目资料；多段参考结构 60-90 秒生成成功，长度 451，命中项目资料。

## V2：爆款选题与 Top 3（实施中，尚未上线）

AI 分为两次任务：先根据服务端读取的最新商家资料生成赛道、5个关键词和5个消费对象/场景；用户确认后，再生成完整25宫格及Top 3。商家正文不由前端提交，也不在运行时读取外部 Markdown。

生成规则固定使用10种爆款元素：成本、借势、对立、幕后、反差、猎奇、人群、怀旧、糟糕、性感。每条选题选择1—2种并解释落点，不输出脚本类型。借势仅使用公开话题；对立只做观点或效果对比；幕后不得编造黑幕；猎奇必须有资料依据；糟糕只做避坑/错误示范且不攻击竞品；性感仅指产品视觉与氛围审美，禁止低俗、性暗示和未成年人内容。

25条必须覆盖全部唯一坐标。Top 3 必须引用不同坐标，固定对应 `traffic`、`trust`、`conversion`，提供理由、难度、素材、拍摄场景和风险提醒，不生成分数、概率或播放量预测。结构或安全校验失败最多重试一次，仍失败则整体失败；不得展示半成品或虚构商家价格、活动、地址、资质、承诺。

## V2：定制化脚本（规划中，尚未实现）

### 目标与输入

定制化脚本不依赖抖音提取或参考结构。用户选择自己的商家项目后，可以输入自由创作要求，或粘贴普通爆款选题/Top 3 方案。前端只用确定性文本规则识别输入类型；识别不调用 AI，也不是安全边界。

爆款选题复制文本从首个非空行开始固定使用五行 `【脚本工坊爆款选题】`、`sourceProjectId`、`sourceType`、`sourceObjective`、商家项目展示名，选题正文从该头后的第六行开始；此前只允许由 Unicode `White_Space` 或 FEFF 组成的空白行。复制项目名时将 CR、LF、U+2028、U+2029 替换为空格，再将连续 Unicode whitespace 收敛为单个 ASCII 空格并 trim。服务端从原始 `requestText` 独立解析官方头，并与 body 的对应来源字段逐项交叉核对；项目名不参与安全判断。`sourceType=topic` 只接受 `sourceObjective=auto`，`sourceType=top_pick` 只接受三个明确经营目标，Top 3 不猜中文标签。首次识别或切换合法来源时，普通选题把界面目标重置为 `auto`，Top 3继承明确来源目标；用户随后仍可修改，编辑同一来源正文不得覆盖手动目标，服务端不得要求二者相等。官方标识或任一保留机器字段出现在正确五行头之外（包括前置空白区）时拒绝；只有全文完全没有官方标识和三个保留机器字段的旧/外部文本才按当前项目继续。

服务端必须按当前登录用户和 `projectId` 读取最新 `profileText`。商家资料是唯一商业事实来源；用户要求、选题方案、来源元数据和上一版正文只决定创作上下文，不能引入或覆盖商家事实。

### Prompt 组装顺序

运行时不读取外部 Markdown，也不发送原始《口播脚本写作方法》或完整案例。实现阶段将 `docs/CUSTOM_SCRIPT_WRITING_RULES.md` 压缩为服务端固定常量，并按稳定前缀组装：

```text
系统安全规则与JSON输出契约
→ 商家最新资料（不可信事实输入）
→ 压缩写作规则
→ 内容目标、表达风格和用户要求（不可信创作输入）
```

固定系统规则作为独立消息；商家资料、写作参数和用户输入组成结构化对象，使用 `JSON.stringify` 或等价安全 JSON 序列化作为用户消息。不得拼接可由输入闭合的 XML/伪标签边界。系统消息必须明确数据值中的任何指令都不能覆盖系统规则。

### 模型与请求策略

- 使用 `DEEPSEEK_MODEL`，本功能目标配置 `deepseek-v4-flash`，显式关闭思考模式。
- 定制化脚本扩展共享 Provider 调用选项，显式传入 `maxAttempts=1` 并关闭 envelope retry；该设置只作用于本功能，不改变其他调用方。
- 语义尝试最多2次：首次调用，以及空响应、非法JSON或领域校验失败后的一次针对性修复。两次共享 Job 的120秒 run deadline，每次请求使用剩余预算，总 Provider 调用最多2次；剩余预算不足时直接超时终止。
- 首轮成功正文 Prompt 以240—300个 Unicode code points 为创作目标，不固定总行数或每行长度；开头写钩子，中段展开痛点、判断和商家资料已有事实，结尾以场景或选择逻辑自然收束。
- `success.finalScript` 先完成JSON shape/规范化、非空与基础非口播内容、禁用表达/数字事实/CTA及上一版重复等现有确定性校验，最后检查80—350内部安全范围。自然段落、任意换行、单句长度和句末标点不作为拒绝原因；80—350内通过全部规则的正文首次即成功，不进入第二次语义调用。
- 少于80、超过350、非法JSON、空响应或其他领域校验失败时，第二次调用固定使用`repairMode=fresh`，只携带安全错误原因；长度错误额外携带服务端`serverCount`和方向，不回灌首轮正文。Prompt仍以240—300为创作目标并只展示约200—350，不得暴露80底线或为凑字编造事实。该顺序不能被解释为服务端已全面验证非数字语义事实。
- 连续两次 `empty_content`（HTTP/JSON envelope 成功但模型 `content` 为空）最终固定为 `CUSTOM_SCRIPT_OUTPUT_INVALID`。只有网络错误、Provider 请求超时或 HTTP 失败归类为 `CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE`；Job 到达120秒 `runDeadlineAt` 仍使用 `CUSTOM_SCRIPT_RUN_TIMEOUT`。
- 第一版不做每次两阶段事实审查、不接 RAG、不为输入分类增加 AI 调用。
- 固定使用持久 `CustomScriptGenerationJob` 与独立 Worker；staging 外部域名5次调用只验收性能，不决定架构。

### 输出契约

AI 只能返回：

```json
{
  "status": "success",
  "finalScript": "完整口播正文"
}
```

或：

```json
{
  "status": "needs_profile",
  "missingFacts": ["main_product", "core_selling_point"]
}
```

`success` 的前后端统一复用 `lib/custom-scripts/text.ts`：依次执行 NFC、CRLF/CR→LF 和边界 trim，边界 trim 去除 FEFF；随后只移除 Unicode `White_Space` 并按 Unicode code points 计数，内部 FEFF 不移除并计1，中文、英文、数字和标点各计1。页面创作目标约200—350字，Prompt 目标为240—300；服务端内部安全范围为80—350 inclusive。允许自然段落与任意换行，同段多句、跨行断句和超过25 code points的单句均不因排版被拒绝，服务端不得按标点自动拆句；正文整体必须至少包含一个 Unicode 字母或数字。正文不得包含标题、分镜、列表、占位符或完全禁用表达。只有转化目标或用户明确要求时允许一个自然轻引导；下一条内容承诺也只有用户明确要求时允许。

如果无依据内容可以删除而不改变主题，删除后继续生成；如果缺少的价格、活动、地址、工艺、数据、资质、功效、服务动作或效果决定了主题，则返回 `needs_profile`。`missingFacts` 本地校验为1—5个互不重复的固定码，只能来自以下18项：`main_product`、`core_selling_point`、`target_audience`、`consumption_scene`、`price`、`promotion`、`address_or_service_area`、`service_process`、`qualification`、`proof_or_case`、`effect_claim`、`production_process`、`materials_or_ingredients`、`service_action`、`business_hours`、`contact_method`、`business_data`、`warranty_or_after_sales`。唯一中文映射为：`main_product`→主营产品、`core_selling_point`→核心卖点、`target_audience`→目标人群、`consumption_scene`→消费场景、`price`→价格、`promotion`→活动、`address_or_service_area`→地址或服务区域、`service_process`→服务流程、`qualification`→资质、`proof_or_case`→证据或案例、`effect_claim`→效果依据、`production_process`→生产或制作流程、`materials_or_ingredients`→材料、原料或成分、`service_action`→服务动作、`business_hours`→营业时间、`contact_method`→联系方式、`business_data`→经营数据、`warranty_or_after_sales`→质保或售后。上述 code 与中文由前后端安全共享的 `lib/custom-scripts/missing-facts.ts` 统一提供，契约、Prompt 与界面不得各自维护副本。模型只返回 code；未知码使完整输出无效，前端只使用本地中文映射，不直接展示 AI 自由文本，且不得回显商家正文或其他输入。技术数字、国家标准和行业结论不能仅因方法论案例出现就迁移到当前商家。

成功正文的数字事实执行完整“数字 + 相邻单位/符号”精确匹配，覆盖常见价格、比例、日期/时长、尺寸、温度与技术单位；`30元` 不得由 `130元` 或 `30分钟` 支持。非数字商业事实仍必须通过阶段5真实事实边界案例验证。换一版除开篇必须变化外，去空白标点后的整篇字符二元组 Dice 相似度达到82%时判为重复；多行正文还保留相同行复用达到70%的检查，因此单段口播也覆盖。重复结果将 `duplicate_body` 作为第二次生成的安全修复原因。

### 成本、安全与可观测性

- Prompt 使用固定前缀并保持简短，以降低 Token 成本并争取供应商上下文缓存命中。
- 每用户每小时最多创建10个定制化脚本新 Job，`needs_profile`、失败和超时也计小时次数；幂等重放不重复计数。共用每日脚本成功额度，只有完整成功结果扣一次。
- POST 创建新 Job 前调用 `assertDailyScriptQuota` 快速拒绝；成功事务必须重新检查每日额度，防止任务运行期间被并发定制任务或其他脚本功能耗尽。
- `(userId, clientRequestId)` 唯一并保存规范 payload 的 `inputHash`。每个文本依次执行 NFC、CRLF/CR→LF、trim，枚举不变；对 `JSON.stringify([projectId,requestText,objective,tone,previousScript||'',sourceProjectId||'',sourceType||'',sourceObjective||''])` 取 SHA-256，`clientRequestId` 不参与。同 UUID 同 payload 返回原 Job，不同 payload 返回幂等冲突。同一用户最多一个活动任务。
- 创建时 `runDeadlineAt=createdAt+120s`，终态 TTL 为30分钟。输入在 `succeeded|needs_profile|failed|canceled` 任一终态立即清空，结果最多保留30分钟且不提供历史列表；超时表现为 `failed + CUSTOM_SCRIPT_RUN_TIMEOUT`。商家正文、Prompt和原始响应永不入 Job。
- Job 持久化 `providerCallsStarted` 和 `semanticAttempt`。每次 Provider 调用前，只能在任务仍为 `processing`、当前 Worker 仍持锁且未过截止时间时原子递增 `providerCallsStarted` 并写入对应 `semanticAttempt`；最大为2，重领 Worker 沿用剩余次数。
- 80—199首个安全稿必须先以严格内部 `quality_fallback` shape写入 `CustomScriptGenerationJob.result`，公共serialize与processing API不得返回正文。第二次Prompt不接收fallback正文；取消、失败和终态清理会删除它，正式成功结果会替换它。
- 质量调使用40秒总预留，覆盖120秒hard deadline内的30秒租约恢复窗口、约1.5秒Worker轮询、数据库余量和至少5秒成功事务。重领Worker在 `providerCallsStarted=1` 时可继续一次增强；`providerCallsStarted=2`且fallback合法时不再调用Provider，直接完成fallback；无合法fallback仍按耗尽失败。
- 医疗语义按整句判断：明确诊断拒绝，真正的科普、预防、不确定表达和咨询医生建议允许；句尾建议咨询医生不能洗白前面的明确诊断。商家高风险断言必须同时出现可信商家主体、能力动词和高风险事实；主体包含固定称呼、服务端项目名称和去常见后缀后的品牌名，普通提问或科普不算能力断言，项目名称不构成医疗或功效依据。
- 正式链路不向第二次Prompt回灌首轮正文。80—199安全稿会保存在数据库内部 `quality_fallback` 中供Worker崩溃恢复；其他未持久化的无效正文与校验上下文在Worker重启后不可恢复。剩余调用仍受总上限2约束。
- Worker 锁30秒失效、每10秒心跳。仅允许重领心跳失效超过30秒的任务；失锁 Worker 的终态、结果和扣额写入必须因 lock token 不匹配而失败。
- 成功结果、`quotaChargedAt` 与 `DailyUsage.scriptsGenerated` 递增在同一个 Serializable 事务重新检查额度并提交。失败、超时、取消和资料不足均不扣额。
- 页面 mount 时调用 `/api/scripts/generate-custom/current`，只恢复当前用户最新且未过30分钟 TTL 的一个 `queued|processing|succeeded|needs_profile|failed|canceled` Job，不返回列表。生成中可调用 `DELETE /api/scripts/generate-custom/:jobId` 取消未扣额任务；取消与完成只能有一个条件更新获胜。
- 定制化脚本所有成功 API 响应统一使用 `{ "success": true, "data": ... }` 包装。
- 日志只记录脱敏耗时、长度/Token/缓存命中桶、重试原因、错误分类和扣额结果。可解析正文的校验失败额外记录白名单 `lineCountBucket=under_5|5_9|10_14|15_20|21_30|over_30`；每次 `custom_script_validation_invalid` 和最终失败可观察最后一次范围桶，但不得记录精确行数。
- 日志不得记录商家正文、用户要求、选题文本、上一版、生成正文、Prompt、模型原始响应或密钥。

### Staging 24句数组隔离探针

该探针只用于判断“让模型返回结构化句子数组，再由服务端原样换行拼接”是否比现有正文字符串契约稳定。它不是产品 API、Worker 或页面契约，在五次真实 staging 探针全部通过前，不得据此修改主业务链路或宣称方案有效。

- 仅当 `CUSTOM_SCRIPT_SENTENCE_PROBE=STAGING` 与现有 `STAGING_ENABLE_REAL_PROVIDERS=1` 同时成立时允许运行；任一缺失或误拼都立即拒绝，且不查询数据库、不发起 Provider 调用。这里的“非 production”指部署环境必须具备显式 staging 标记，不是 `NODE_ENV` 构建模式；staging 容器使用 production build，因此双 staging 开关成立时允许 `NODE_ENV=production`。
- 只读加载固定测试账号“测试-1”下项目“小岛西点烘焙”的最新 `profileText`。不得输出账号、项目名、数据库 ID、资料、固定需求、Prompt、模型正文或密钥。
- 固定使用当前 `deepseek-v4-flash`、`thinking=disabled`、`maxTokens=1600`、`temperature=0.75`、`response_format=json_object`，并将 Provider 与 envelope 尝试都限制为一次。
- Prompt 顺序保持为安全规则 → 商家资料 → 压缩写作规则 → 固定用户需求。探针成功形状仅为 `{"status":"success","sentences":[...]}`；`needs_profile` 继续使用18项固定缺失资料码。
- `sentences` 必须正好24项。每项必须是非空字符串、只含一个完整口播句、无换行、无编号/标题/解释、以终止标点结尾、正文最多25个 code points；建议每句11—13个 code points。
- 服务端只执行 `sentences.join("\n")`，不 trim、不规范化、不补写、不删除、不重排、不截断；探针先执行自己隔离的280—300长度门槛，再把拼接结果包装成现有 `finalScript` 契约，复用行格式、禁用表达、数字事实、CTA和上一版重复校验。正式产品80—350内部安全范围不改变该历史探针门槛。
- 不创建或更新 `CustomScriptGenerationJob`、`DailyUsage` 或其他业务记录；Provider 调用不传 `usageUserId`，因此不扣用户额度，也不写 DeepSeek 用量。
- 最多连续调用5次，任意一次失败立即停止并输出 `gate=false`；只有5次全部通过才输出 `gate=true`。输出只允许 runIndex、状态、耗时、JSON解析状态、是否精确24句、长度桶、单句上限/标点布尔值、白名单校验原因、finish reason 与 Token/缓存桶。

### Staging 固定 prefixId 扩写与确定性子集探针

第二个探针只验证一个独立决策假设：模型先给出24个安全完整句，再为每个索引从服务端公开的固定 `prefixId` 枚举中选择1—3个候选；服务端把 ID 映射为固定衔接短语并执行 `fixedPrefix + originalSentence`，再确定性选择若干完整句，使最终正文达到280—300字。它不接入产品 API、Job、Worker、额度或页面，也不授权修改主业务契约或部署生产。

设计理由：真实 staging 与对抗 fixture 已分别证明，完整 replacement 会原样回显，自由文本 prefix 又能新增“每天现做”“免费配送”等非数字商业事实，并产生同一口头词重复15次的机械脚本。字符白名单不能证明语义安全；必须从结构上撤销模型创造最终文字的权限。

设计优点：模型只做有限 ID 选择，所有进入正文的新增文字都来自可审计的服务端映射；未知表达、商业事实、指令和 Unicode 绕过没有进入候选的表示能力。选择器同时约束重复和相邻多样性，长度与自然度都可确定性复现。

能力边界：该探针只能验证固定安全商家资料下的结构、长度、固定短语映射和既有完整校验，不能证明产品主链路已经修改，也不能证明所有商家和自由输入都稳定生成。它不替代阶段5真实内容质量验收。

限制说明：固定衔接短语只承担强调、转折、承接、换角度和回到场景等话语功能，不会生成新的商业信息；因此当基础稿距离280过远、所有可用短语使单句超过25字或多样性约束无解时，探针必须失败，不回退自由文本或服务端硬凑正文。

- `PREFIX_ID_TO_TEXT` 是唯一运行时事实源，固定10项、每项2—5个Unicode code points：`actually`→`其实`、`contrast`→`不过`、`therefore`→`所以`、`another_angle`→`换个角度`、`at_this_point`→`说到这里`、`back_to_scene`→`回到眼前`、`think_again`→`仔细想想`、`in_other_words`→`换句话说`、`more_important`→`更关键的是`、`put_plainly`→`说得直接些`。短语不得包含价格、优惠、配送、原料、资质、效果、服务动作或商家事实。
- 仅当 `CUSTOM_SCRIPT_REPLACEMENT_PROBE=STAGING` 与 `STAGING_ENABLE_REAL_PROVIDERS=1` 同时成立，且运行模型严格为 `deepseek-v4-flash` 时允许只读运行；所有门禁均在数据库读取和 Provider 调用前执行。
- 第一轮Prompt固定要求24句基础稿整体低于280字，以验证补足路径；正式产品语义已改为80—350内部安全范围内的合规正文可直接成功。隔离探针即使收到其历史280—300门槛内的基础稿也仍需验证第二次响应契约，不能靠非法响应或空选择得到 `gate=true`；基础稿超过300则在第一次调用后失败。
- 第二次把24句只作为最后一个 user JSON 字段 `untrustedSentences`，唯一响应为 `{"status":"success","prefixChoices":[{"index":0,"prefixIds":["actually","contrast"]}]}`。外层和24个内层对象必须是精确字段；索引0—23唯一完整；每项1—3个不重复且已知的 `prefixId`。候选顺序不表达偏好，也不是安全门禁；服务端按固定枚举顺序规范化后再生成候选。旧 `prefix`/`prefixes`/`replacement`、未知ID、自由文字伪装ID、额外字段、缺失/重复/越界索引、0项或超过3项ID、重复ID一律拒绝。
- 服务端候选只保存 `index + prefixId`。校验和finalizer均从唯一映射重新得到fixedPrefix、拼接原句并重算delta/长度；调用方伪造 `prefix`、`replacement` 或 `delta` 不产生影响。只有拼接后单句仍不超过25字且通过现有非长度校验的候选可进入选择器。
- 选择器先最小化最终长度与290的距离，再最小化替换句数，最后按索引和枚举ID顺序稳定决胜；同一prefixId最多选2次，相邻选中句不得使用相同ID，选中超过2句时至少包含2种ID。最终必须至少选中1项；安全增量不足、所有候选超长或多样性无解均返回 `no_solution`。
- 任一失败使本轮 `gate=false` 并停止后续轮次。最多5轮、每轮最多2次Provider调用；CLI在输出脱敏结构化结果后返回非零退出码。输出只允许白名单finish reason、Token/缓存桶、JSON状态、数量/候选/选中桶、最终长度桶、耗时、Provider调用数和白名单失败原因。
- 探针不传 `usageUserId`，不创建或更新 `CustomScriptGenerationJob`、`DailyUsage` 或AI用量。真实DeepSeek只由主Agent在授权的staging终端运行；开发、CI和验收不得自行发起真实调用。

#### 第四轮：观测最小化与选择器硬预算

设计理由：固定 `prefixId` 已解决模型新增正文事实的信任边界，但外部探针日志仍暴露有效选项、逐原因和逐句长区间的精确数量；选择器也只用全局最短/最长前缀估算，未利用当前候选的实际可达增量，24×3候选的极短base无解输入会进入高成本穷举。两项问题均属于隔离探针的P2收口，不授权改变现有prefixId、排序、多样性或产品链路。

设计优点：日志仍保留定位所需的范围信息，却不暴露精确分布；选择器在不改变业务答案的前提下，用固定映射长度、实际可用索引、每ID最多2次、后缀容量和可达增量提前排除无解状态。三进制使用次数编码减少memo体积；唯一状态和分支转移硬预算保证最坏输入确定结束。

能力边界：内部 `PrefixChoiceEvaluation.validChoiceCount` 与精确原因计数只用于同进程gate判断，绝不进入 `ReplacementProbeMetric`、stdout或持久记录。选择器仍只处理24个索引、10个固定ID和280—300目标；它不会降低内容、安全或完整脚本校验。

限制说明：数量桶 `0|1_5|6_12|13_23|24` 的 `24` 表示24及以上；它适合诊断区间，不用于精确统计。预算耗尽必须返回白名单 `selection_budget` 并使本轮失败，不能返回半成品、回退自由文本或伪装成 `no_solution`。不得用 `base<某值` 的硬拒绝替代可达性分析。

- 外部 `ReplacementProbeMetric` 删除精确 `validChoiceCount`；只保留 `validChoiceCountBucket`。内部 `reasonCounts` 输出前转换为 `reasonCountBuckets`，每个值只能是上述五档。`baseSentenceLengthBuckets` 的每个分布值也必须是同一数量桶，不能输出精确句数。
- 数量桶、候选桶、长度桶、`finishReason`、响应长度桶、解析错误桶和Token桶均用闭合联合类型表达；仅 `runIndex`、`durationMs`、`providerCalls` 与最终 `runsCompleted` 可以输出精确数值。
- 候选预处理去重并按索引和ID枚举序排序；传入 `delta` 必须等于服务端固定映射的code point长度，否则候选无效。全局预检和递归剪枝都使用当前候选在实际索引上的可用性以及每ID剩余最多2次的容量。
- 每个递归位置预计算后缀可用索引数、各ID可用次数和可达最小/最大增量；10个ID的0—2使用次数以三进制整数编码进入memo。默认全调用预算最多250,000个唯一状态、1,000,000次分支转移，递归深度固定不超过24；测试可注入更小预算。
- 选择器业务顺序保持“距290最近→替换更少→索引/ID枚举序稳定”，同一ID最多2次、相邻选中项不得同ID、选中超过2项至少2种ID。预算内确定无解仍返回 `no_solution`；只有预算先耗尽时返回 `selection_budget`。
