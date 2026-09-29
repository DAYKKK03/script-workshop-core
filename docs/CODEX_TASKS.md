> 以下为来源项目的历史记录，不代表基础版当前部署或验收状态。当前交付范围见 README.md；本次拆分验证见 docs/CORE_EDITION_VERIFICATION.md。

# CODEX_TASKS.md

## Codex 执行总原则

每次只做一个任务，不要一次性写完整项目。

每次开始前必须：阅读 AGENTS.md；阅读和当前任务相关的 docs 文件；输出当前任务计划；等待确认后再执行，除非用户明确要求直接执行。

每次完成后必须：说明修改文件、完成功能、运行方式、测试方式、未完成项和已知问题。

## Task 1：项目骨架

目标：创建基础项目结构和页面框架。

要求：Next.js + TypeScript；Tailwind CSS；基础布局；登录页；注册页；工作台首页；商家项目列表页；商家项目新建/编辑页；抖音脚本拆解与生成页。

验收：本地可以启动；页面可以访问；暂时可以使用 mock UI；不需要实现真实业务逻辑。

## Task 2：数据库与 Prisma

目标：实现 User、InviteCode、Project。

要求：创建 Prisma schema；创建 migration；创建 seed；seed 中生成几个 unused 邀请码；passwordHash 字段不能存明文。

验收：可以成功运行 migration；可以成功运行 seed；数据库中存在邀请码。

## Task 3：注册登录与邀请码

目标：实现账号密码注册登录。

要求：注册必填账号、密码、邀请码；邀请码必须 unused；注册成功后邀请码变 used；登录成功后进入工作台；未登录用户不能访问受限页面。

验收：无邀请码注册失败；有效邀请码注册成功；已使用邀请码注册失败；禁用邀请码注册失败；登录成功；登出成功。

## Task 4：商家项目 CRUD

目标：实现商家项目管理。

要求：项目字段只包含 projectName 和 profileText；profileText 用大文本框；用户只能看到自己的项目；用户只能编辑自己的项目；删除项目需要权限校验。

验收：创建项目成功；编辑项目成功；删除项目成功；用户隔离正确；更新后 updatedAt 改变。

## Task 5：抖音脚本拆解与生成页骨架

目标：搭建完整流程页面。

步骤：选择商家项目；粘贴抖音链接；显示自动提取原口播文案区域；显示参考结构拆解区域；选择时长；显示最终脚本文案；复制按钮。

要求：第一版不做历史记录；第一版不做站内编辑；不出现手动粘贴文案入口；不出现上传视频/音频入口。

验收：页面流程清晰；没有 PRD 明确不做的功能入口。

## Task 6：抖音口播提取 Provider

目标：封装抖音自动提取能力。

要求：创建 douyinTranscriptProvider；输入 douyinUrl；输出 originalTranscript；失败时返回统一错误；不允许硬抓取作为核心实现；如果没有真实 provider，先返回 BLOCKED 或 mock 标记，不允许伪装真实成功。

验收：有清晰 provider 接口；有失败处理；页面显示固定错误提示：`当前链接无法自动提取，请更换可提取的抖音视频链接`。

## Task 7：参考脚本拆解

目标：实现 analyzeReferenceScript。

要求：输入 originalTranscript；输出 referenceStructure；每段包含 structureName 和 originalText；顺序贴合原文；不泛泛总结。

验收：JSON 格式稳定；每段都有原文片段；originalText 与原口播文案高度相关。

## Task 8：新脚本结构生成

状态：已取消。

说明：产品流程调整后，不再单独输出商家版新脚本结构。

验收：页面和 API 不提供独立新结构生成入口。

## Task 9：完整脚本生成

目标：实现 generateFinalScript。

要求：输入 projectId、referenceStructure、duration；服务端读取所选项目最新 profileText；duration 支持 15-30、30-60、60-90；直接生成完整口播文案；结果可复制；不保存历史；不提供站内编辑。

验收：三个时长都能生成；生成内容符合字数范围；使用项目最新资料；复制按钮正常；未配置 AI Key 时不伪装成功。

## Task 10：回归测试与清理

目标：检查 PRD v1 是否完整跑通。

要求：按 TEST_PLAN.md 逐项测试；修复权限问题；修复错误提示；删除不符合 PRD 的入口；确认没有历史记录和编辑器。

验收：TEST_PLAN 关键用例通过；文档和实际功能一致。

## P1-1：DeepSeek AI 拆解与生成服务接入

目标：接入真实 DeepSeek AI service，让参考脚本拆解和完整脚本生成在配置 `DEEPSEEK_API_KEY` 后调用真实 AI。

要求：使用 `https://api.deepseek.com`；默认模型 `deepseek-v4-flash`；Key 只从服务端环境变量读取；未配置 Key 时继续返回明确 blocked/失败；拆解输出使用 sections，并兼容当前 referenceStructure；最终脚本生成继续读取当前用户项目最新 profileText。

禁止：不接真实抖音 Provider；不新增手动粘贴、上传、历史记录、站内编辑；不改数据库 schema；不写入任何真实 API Key。

验收：typecheck、lint、build 通过；无 Key 时拆解/生成不伪装成功；非当前用户项目生成失败；源码中没有真实 DeepSeek Key。

## P1-2：DeepSeek 真实调用联调与生成质量控制

目标：在本地配置 `DEEPSEEK_API_KEY` 时完成一次真实拆解 + 生成联调，并增强 AI 输出质量保护。

要求：检查本地 Key 是否存在但不打印 Key；有 Key 时验证真实 DeepSeek 返回结构和最终文案质量；无 Key 时保持 blocked，不伪造结果；DeepSeek 非 JSON 或空输出最多轻量重试一次；最终文案不能为空、不能明显过短、不能整段复制参考原文。

禁止：不接真实抖音 Provider；不新增手动粘贴、上传、历史记录、站内编辑；不写入任何真实 API Key 或真实 AI 输出到日志。

验收：lint、typecheck、build 通过；无 Key blocked 行为通过；有 Key 环境完成真实调用验证；源码、文档、日志不包含真实 Key。

## P1-3：DeepSeek Key 安全配置与真实端到端联调

状态：DONE_WITH_RISK。

目标：确认 DeepSeek Key 安全配置方式，并在本地安全配置 Key 时完成真实拆解 + 生成端到端联调。

要求：Key 只能放在服务端环境变量或部署平台 Secret；网站用户不配置 Key；不允许 `NEXT_PUBLIC_DEEPSEEK*`；不允许把 Key 写进源码、文档、日志或前端 bundle；有 Key 时至少测试 15-30 和 30-60 两个时长；无 Key 时真实 E2E 标记 BLOCKED。

质量控制：最终脚本必须基于当前用户项目最新资料；不能沿用参考商家店名、位置、菜品、活动、卖点；长度不合格或明显复制参考原文时最多重试一次。

禁止：不接真实抖音 Provider；不新增手动粘贴、上传、历史记录、站内编辑；不改数据库 schema；不做 UI 重构。

验收：lint、typecheck、build 通过；安全扫描无真实 Key、无 `NEXT_PUBLIC_DEEPSEEK`；无 Key blocked 行为通过；本地有 Key 时真实拆解、15-30 和 30-60 生成通过并只记录质量摘要。60-90 真实生成已尝试，当前仍有质量校验失败风险，后续继续调优。

## P1-4：抖音口播提取链路测试与合规 Provider 调研

状态：DONE_WITH_RISK。

目标：调研合规抖音口播提取 Provider 可行性，确认火山 ASR 的下游定位，并验证当前无 Provider 时固定失败路径稳定。

要求：只允许合规 Provider 或授权媒体 URL 下游 ASR；不做抖音非公开接口调用、签名逆向、模拟登录、用户 Cookie、验证码/风控绕过、无水印下载、灰产解析；不新增手动粘贴、上传、历史记录、站内编辑；不改数据库 schema。

结论：本轮公开资料未发现可立即接入的官方“任意抖音链接提取口播/字幕/音频”接口。火山 ASR 可作为“合法音频/视频 URL -> 文本”的下游能力，但不能解决“抖音链接 -> 音频/字幕”的上游获取。当前 Provider 保持 blocked，并稳定返回固定用户提示。

验收：lint、typecheck、build 通过；无合规 Provider 时不产生假 transcript；提取 API 返回固定失败提示；安全扫描未发现新增 Key 或违规抓取代码；文档记录候选链路、接入条件和剩余风险。

## P1-5：Provider 接口 + ASR 跑通链路 + TikHub 默认关闭 Provider 插槽

状态：DONE_WITH_RISK。

目标：按 `Provider 接口 -> ASR 实现 + TikHub 实现(默认关) -> DeepSeek 拆解 -> 脚本生成` 架构整理抖音提取服务端链路。

要求：`DOUYIN_PROVIDER` 支持 `blocked` / `asr` / `tikhub`；默认 blocked；ASR 只处理服务端配置的合法授权媒体 URL；TikHub 只作为测试 Provider 插槽，必须显式启用并配置服务端 Key/Base URL；不写真实 Key；不新增手动粘贴、上传、历史记录、站内编辑；不改数据库 schema；Provider 不可用时继续固定失败，不返回假 transcript。

验收：lint、typecheck、build 通过；默认配置下抖音提取固定失败；无 ASR Key 时 ASR 不伪造成功；未设置 `DOUYIN_PROVIDER=tikhub` 或无 TikHub Key 时不调用 TikHub；源码和前端不暴露 Provider Key；DeepSeek 拆解/生成服务不被破坏。

## P1-6：配置真实 Provider 测试模式并验证返回结构

状态：DONE_WITH_RISK。

目标：在不改变生产默认 provider 的前提下，为 TikHub 测试模式增加安全结构检查，确认返回结构属于 transcript、media URL、unknown 或 not_configured。

要求：只在 `DOUYIN_PROVIDER=tikhub` 且服务端配置 `TIKHUB_API_KEY`、`TIKHUB_API_BASE_URL`、`TIKHUB_TEST_DOUYIN_URL` 时调用 TikHub；不打印 Key、不输出完整原始响应或敏感 URL；TikHub 不标记为合规生产 Provider；默认 provider 仍为 blocked；未知结构不能成功；media URL 需要 ASR 才能转写，无 ASR Key 时 fixed failure。

当前结论：本地 TikHub Key/Base URL/Test URL 未配置，因此未执行真实 TikHub 外部调用；测试结构状态为 `not_configured`。服务端测试模式和 unknown 结构失败路径已验证。

验收：lint、typecheck、build 通过；默认 provider fixed failure；无 Key 不调用 TikHub；测试模式 unknown 结构不成功；源码、文档、日志和前端不暴露真实 Key；DeepSeek 拆解/生成现有服务不被破坏。

## P1-7：真实 TikHub 测试调用与返回结构判定

状态：DONE_WITH_RISK。

目标：在本地服务端 TikHub 测试配置存在时执行真实测试调用，只记录结构摘要，不暴露 Key、完整响应或完整媒体 URL。

要求：不把 TikHub 设为生产默认能力；不改数据库 schema；不新增上传、手动粘贴、历史记录、站内编辑；不打印 `.env.local` 内容；不写真实 Key；如果 TikHub 返回 transcript 则验证后续 DeepSeek 拆解；如果返回 media URL 且无 ASR Key，则固定失败不伪造 transcript；如果 unknown/provider_error，则记录摘要并固定失败。

结论：TikHub 真实测试调用已发生；返回结构摘要为 `provider_error`，HTTP 状态摘要 405；未拿到 transcript，未拿到 media URL，不需要进入 ASR。API 仍返回固定失败提示；DeepSeek 拆解/生成摘要验证通过。

验收：lint、typecheck、build 通过；真实调用状态和结构摘要已记录；默认 provider 代码分支仍 blocked；源码、文档、日志和前端未暴露真实 Key。

### P1-7 Fix：修正 TikHub 请求方式和路径

状态：DONE_WITH_RISK。

修复：TikHub 请求方式从 POST 改为 GET；路径固定为 `/api/v1/douyin/web/fetch_one_video_by_share_url`；通过 `share_url` 查询参数传入测试链接或用户输入链接；Base URL 拼接去除尾部多余斜杠。

结论：真实调用结果已从 HTTP 405 变为 HTTP 401，说明方法/路径已推进到授权类响应。当前仍为 `provider_error`，未拿到 transcript，未拿到 media URL；API 仍固定失败，不伪造 transcript；DeepSeek 拆解/生成摘要验证通过。

### P1-7 Fix 2：移除 desc 假 transcript 风险并继续定位 TikHub 401

状态：DONE_WITH_RISK。

修复：从 transcript 字段白名单移除 `desc`，避免视频描述被当成口播 transcript；保留明确 transcript/caption/subtitle/asrText/resultText 等字段。

结论：认证方式摘要显示 `Authorization: Bearer` 返回 200，直接 `Authorization` 和 `X-API-Key` 返回 401。真实 TikHub 测试调用返回结构为 `transcript`，未返回 media URL，不需要 ASR；提取 API 已返回 `originalTranscript`，DeepSeek 拆解和最终生成摘要链路已跑通。

## P1-8：多链接真实 Provider 稳定性测试

状态：DONE_WITH_RISK。

目标：读取 `TIKHUB_TEST_DOUYIN_URLS` 多链接或回退单条 `TIKHUB_TEST_DOUYIN_URL`，执行 TikHub 真实 Provider 稳定性摘要测试。

要求：不输出 Key、完整链接、完整响应、完整 transcript、完整 media URL；只输出 index、结构类别、HTTP 状态摘要、transcript 是否存在与长度、是否命中 media URL、是否需要 ASR、是否可进入 DeepSeek 拆解。

结论：用户补充 5 条真实分享链接后已完成多链接稳定性测试；结果为 transcript 4、media_url 0、unknown 1、provider_error 0、可进入 DeepSeek 拆解 4。抽样 DeepSeek 拆解 2 条，sections/referenceStructure 摘要分别为 2/2、1/1。当前 transcript 成功率较高，建议进入 P1-9 页面真实流程接入测试。

## P1-9：页面真实流程接入测试

状态：DONE_WITH_RISK。

目标：把真实 Provider + DeepSeek 拆解/生成链路放到网页页面流程里做完整联调。

本轮已完成：生成页源码预检确认页面调用真实提取、拆解和最终生成 API；参考结构展示结构名称和原文片段；最终文案存在后才展示复制按钮；复制调用浏览器剪贴板并有成功/失败反馈；`/generate` 仍通过 `requireUser()` 保护并只读取当前用户项目。

Retry 结果：真实 HTTP/session 流程完成临时用户注册登录、临时项目创建、`/generate` 访问、成功链接 transcript 提取、DeepSeek 拆解、15-30 秒最终文案生成、unknown 链接固定失败、未登录拦截、非当前用户项目生成失败、临时数据清理。

修复：提取 API 不再把 Provider 内部失败码暴露给前端，统一返回 `DOUYIN_TRANSCRIPT_UNAVAILABLE` 和固定失败提示。

可视化补验：已通过浏览器页面完成注册、项目创建、进入生成页、提取拆解、生成最终文案和复制按钮实际点击；复制成功反馈显示正常。不可提取链接页面展示固定失败提示，未发现内部接口或 Key 暴露。

## P1-10：单链接资源获取 + 火山/豆包 ASR POC

状态：DONE_WITH_RISK。

目标：使用用户提供的单条抖音分享链接验证 TikHub 是否能拿到 transcript 或 media URL；如只有 media URL，再评估火山/豆包 ASR 最小转写 POC。

要求：不输出完整链接、完整 TikHub 响应、完整 transcript、完整 media URL、完整 ASR 返回或任何 Key；不改主页面；不把 TikHub 写成生产合规能力；缺少 ASR 配置时只记录 `ASR_NOT_CONFIGURED`。

结论：单链接测试中 TikHub 返回 transcript，初始未命中 media URL，因此 ASR 不需要执行；本地 ASR 环境变量未配置。

### P1-10 Fix：TikHub 视频 URL 字段映射 + 火山/豆包 ASR 单链路验证

状态：DONE_WITH_RISK。

修复：TikHub media URL 解析新增显式嵌套路径支持，包括 `aweme_detail.video.play_addr.url_list`、`download_addr.url_list`、`play_addr_h264.url_list` 和明确音乐播放 URL 路径；media URL 必须是 `http://` 或 `https://`。继续禁止把 `desc`、`title`、`share_desc`、`nickname` 等描述性字段当作 transcript。

结论：mock 嵌套路径验证通过，用户单链接真实测试同时命中 transcript 与 media URL；主链路仍优先 transcript，ASR 服务端配置缺失，媒体转写未执行且未伪造结果。

## P1-11：火山/豆包 ASR Provider 接入 POC

状态：DONE_WITH_RISK。

目标：把链路推进到 `TikHub media_url -> 火山/豆包 ASR -> transcript 摘要`，ASR 成功后再进入 DeepSeek 拆解/生成摘要。

要求：只读取服务端环境变量；不输出完整 media URL、ASR response、transcript、最终脚本或任何 Key；不改前端；不新增上传、手动粘贴、历史记录、站内编辑。

已完成：新增 `lib/asr/volcengine-asr-provider.ts` 服务端 POC 模块，抽离授权媒体 URL 转写逻辑；接回 `douyinTranscriptProvider` 的 ASR 分支；补充 `.env.example` 空占位；配置缺失和 mock 成功响应均已验证。

### P1-11 Fix：按火山/豆包 ASR curl 示例完成 submit Provider

状态：BLOCKED。

修复：Provider 已按用户 curl 示例改为 submit 接口格式：endpoint 使用 `VOLCENGINE_ASR_ENDPOINT`，鉴权使用 `VOLCENGINE_ASR_API_KEY` 写入 `x-api-key`，资源使用 `VOLCENGINE_ASR_RESOURCE_ID` 写入 `X-Api-Resource-Id`，每次生成 `X-Api-Request-Id`，`X-Api-Sequence` 固定 `-1`，body 使用 `user` / `audio.url` / `request.model_name`。

验证：缺 key 返回 blocked；mock submit 成功返回 submitted 任务态，不伪造 transcript；mock HTTP 失败返回状态摘要。

Real Submit 结论：本地 key 配置后已使用 TikHub media URL 真实调用火山 submit；HTTP 成功，状态头显示受理成功并返回 request id 摘要。submit 未直接返回 transcript，当前不能进入 DeepSeek 拆解/生成；下一步需要补充查询/轮询接口才能获得转写文本。

## P1-12：火山 ASR 查询/轮询接口接入测试

状态：DONE_WITH_RISK。

目标：补齐 `TikHub media_url -> 火山 submit -> 火山 query/poll -> transcript -> DeepSeek` 链路。

实现：Provider 已支持从 submit endpoint 推导 `/query`，也支持 `VOLCENGINE_ASR_QUERY_ENDPOINT` 覆盖；query 使用 submit request id、同一 `x-api-key` 和 `X-Api-Resource-Id`，支持有限次数轮询。

验证：mock query 成功可解析 transcript；query 未返回 transcript 时保持 submitted，不伪装成功。真实链路中 TikHub media URL 命中，火山 submit 受理成功，但 query 轮询 3 次仍未返回 transcript，因此未进入 DeepSeek。

风险：query endpoint 可访问，但当前缺少官方查询/轮询参数和状态码语义，需补充结果接口说明后继续。

### P1-12 Fix：按火山官方文档修正 query 请求和轮询逻辑

状态：DONE_WITH_RISK。

修复：query body 固定 `{}`；header 使用 `X-Api-Key`、`X-Api-Resource-Id`、`X-Api-Request-Id`；query 阶段不发送 `X-Api-Sequence`；状态码 `20000001/20000002` 继续轮询，其他错误码失败摘要。

验证：mock query 成功、处理中后成功、timeout、错误码失败均通过。真实链路中 TikHub media URL 命中，火山 submit/query 返回 transcript，长度摘要 1058；DeepSeek 拆解成功 9 段，最终生成成功，长度摘要 116。

风险：当前仍是后端链路验证；下一步需要做页面级真实流程回归，确认页面在仅 media URL 场景下能走 ASR。

## P1-13：页面级真实流程回归测试

状态：DONE_WITH_RISK。

目标：验证用户登录后在 `/generate` 上选择商家项目、输入抖音链接、触发 TikHub media URL、火山 ASR、DeepSeek 拆解和最终生成的真实路径。

修复：当 TikHub 同时返回短 transcript 和 media URL 时，服务端优先走 ASR，避免短标题类文本进入拆解/生成；提取 API 成功响应只返回 `originalTranscript`，不向前端返回 `source` 或完整媒体 URL；ASR 查询默认轮询调为 15 次、3 秒间隔，仍支持环境变量覆盖。

验证：真实 session/API 流程已完成临时用户注册、临时商家项目创建、登录态访问 `/generate`、TikHub media URL 命中、火山 ASR transcript 摘要、DeepSeek 拆解 6 段、30-60 秒最终脚本生成成功且命中项目资料；无效链接固定失败；未登录 `/generate` 跳转登录；跨用户项目生成失败；临时数据已清理。

风险：当前环境未提供可用浏览器快照/点击工具，页面点击流使用登录态 HTML 源码检查 + 真实 HTTP/session API 链路补证；复制按钮逻辑仍依赖既有页面实现和 P1-9 可视化补验结果。

## P1-14：上线前稳定性与生产配置收口

状态：DONE_WITH_RISK。

目标：在不新增业务功能的前提下，收口上线前配置、安全、外部接口超时、错误边界、防重复提交和部署 checklist。

实现：补齐 `.env.example` 生产变量清单；新增 `docs/DEPLOYMENT_CHECKLIST.md`；TikHub 请求增加超时；火山 ASR submit/query 单次请求增加超时；火山 submit endpoint 支持 `VOLCENGINE_ASR_SUBMIT_ENDPOINT` 并兼容旧变量；生成页提取/生成 handler 增加处理中 guard。

验证要求：lint、typecheck、build；缺 DeepSeek Key 不生成假文案；缺 TikHub/火山配置不伪造提取成功；无效抖音链接固定失败；处理中按钮/handler 防重复；安全扫描无 Key、完整媒体 URL、完整 transcript、完整最终文案落盘；文档 env 只含占位；无新增 PRD 外入口。

风险：本轮不实现商业级限流、队列、监控或多实例幂等；上线后如面向真实流量，需要补充服务端频控、观测和告警。

## P1-15：部署演练与真实浏览器端完整回归

状态：BLOCKED。

目标：本地生产模式运行演练，并在生产模式下验证页面/真实链路完整路径。

完成：新增 `npm run start` 生产启动脚本；`npm run build` 和 `npm run start` 可运行；生产模式下 `/`、`/login`、`/register` 返回 200，未登录 `/generate` 返回 307 并跳转 `/login`；临时用户注册、项目创建、登录态 `/generate` 访问、无效链接固定失败、跨用户项目隔离、临时数据清理均通过。

阻断：真实浏览器点击工具仍不可用；生产模式完整同步链路在提取阶段不稳定。TikHub 可命中 media URL，直接火山 ASR 诊断曾在扩展轮询窗口内成功返回 transcript 摘要，但同一生产 API 路径多次仍在约 90-114 秒后返回固定失败，未进入 DeepSeek 拆解/生成。因此不能将“浏览器端完整回归”或“生产完整生成链路”写成通过。

部署判断：SQLite 只建议用于本机/单机持久磁盘部署；Vercel、Serverless 或无持久磁盘平台上线前建议迁移 PostgreSQL。当前同步 ASR 方案不适合短超时 Serverless；P1-16 建议优先做部署平台选择、PostgreSQL 迁移评估，以及 ASR 异步任务/轮询式页面流程设计。

## P1-16：ASR 异步任务与页面轮询

状态：DONE_WITH_RISK。

目标：解决 P1-15 同步提取请求等待过长的问题，把 `抖音链接 -> TikHub media URL -> 火山 ASR` 从长同步请求拆为运行态任务和页面轮询。

范围：

- 新增 `ExtractionJob` 运行态任务表，仅用于当前提取任务状态，不作为用户可见历史记录。
- 新增 `POST /api/douyin/extraction-jobs` 创建任务，要求登录并校验当前用户项目。
- 新增 `GET /api/douyin/extraction-jobs/:id` 查询任务，只允许当前用户查询自己的任务。
- 生成页改为创建任务后轮询，任务成功后再进入现有 DeepSeek 拆解和最终生成流程。
- 任务失败或超时继续显示固定失败提示：`当前链接无法自动提取，请更换可提取的抖音视频链接`。
- 完整抖音链接只在任务处理期间临时保留，任务终态后清空；长期只保留 host/hash 摘要。
- 完整 transcript 只在成功任务首次被当前用户读取时返回，随后从数据库清空；过期任务会被机会式删除。

安全边界：

- API 不向前端返回 media URL、Provider 原始响应或 ASR 原始响应。
- 文档和日志不记录完整链接、完整 transcript、完整最终文案或 Key。
- `DOUYIN_PROVIDER=blocked` 仍可作为回滚能力。

风险：

- 当前实现为本地/单实例 in-process 异步执行 + DB 状态记录；进程重启可能导致 queued/processing 任务失去完整 sourceUrl 后失败或需要用户重试。
- 多实例或 Serverless 生产部署仍建议使用持久队列/后台 worker，并优先评估 PostgreSQL。

验证：Prisma migration 已生成并应用；P1-16 Fix 增加数据清理 migration，清除既有任务中的完整 sourceUrl/transcript；`npm run lint`、`npm run typecheck`、`npm run build` 均通过。真实 HTTP/session 接口验证覆盖未登录创建任务、无效链接固定失败、创建任务 202、当前用户查询 processing、跨用户查询 404、成功态响应不返回 media/audio/source 字段；返修验证覆盖成功任务首次读取后 transcript 清空、过期任务机会式清理；临时测试账号、项目、邀请码和任务已清理。

## P1-17：部署平台与生产数据库/任务队列方案决策

状态：DONE_WITH_RISK。

目标：在不做大规模代码迁移的前提下，明确上线架构决策：部署平台、生产数据库、异步任务/worker/队列方案、最小上线路径和后续实施阶段。

决策：

- 最快 MVP 上线：单 VPS 或单长运行服务器 + PostgreSQL + DB polling worker。
- 稳定生产上线：支持 web/worker 分离的托管平台 + managed PostgreSQL + DB polling worker 或平台队列。
- 不推荐 Vercel-only / pure Serverless 直接承载完整提取链路；如果使用 Vercel，必须把数据库和 worker/queue 外置。
- SQLite 只保留为本地开发或极短期单机内测选择，不作为真实生产默认方案。
- BullMQ/Redis 暂不作为第一阶段必选，除非 DB polling worker 无法满足并发、重试或监控需求。

文档：详见 `docs/DEPLOYMENT_ARCHITECTURE_DECISION.md`。

后续阶段：

- P1-18：PostgreSQL 生产数据库迁移与验证。
- P1-19：Extraction worker，把任务处理移出 API 请求生命周期。
- P1-20：生产 smoke test、日志安全和基础观测。

## P1-18：香港 staging 就绪与生产安全收口

状态：BLOCKED。

已完成：

- PostgreSQL schema、initial migration 和 Prisma Client 本地静态验证。
- CI/发布工作流增加 PostgreSQL 服务与 `prisma migrate deploy` 阻断。
- Worker 默认并发和每用户同时处理上限固定为 2，并按任务持久化的重试上限执行抢占和恢复。
- 管理员恢复码增加服务端 HMAC pepper，认证响应禁用缓存，生产 Prisma 日志不记录错误详情，管理员初始化秘密改为一次性 `0600` 文件。
- ASR 用量按媒体时长统计，Compose 显式接收完整 `DATABASE_URL`，备份脚本增加退出清理。
- 自动化测试、lint、类型检查、生产构建、YAML 和 shell 语法均通过。

阻断：

- 本机没有 Docker、PostgreSQL 客户端或可连接的 PostgreSQL，不能完成真实 migration、Worker 并发抢占/重试/超时/重启恢复和数据库会话 smoke。
- 尚未创建或连接香港 staging、EdgeOne、COS、GHCR/GitHub Environment 和正式域名，不能声明云上部署、备份恢复或回滚成功。
- 下一步必须在真实 staging 按 `docs/PRODUCTION_RUNBOOK.md` 和 `docs/DEPLOYMENT_CHECKLIST.md` 完成上线门槛。
