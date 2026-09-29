# TEST_PLAN.md

## 测试目标

验证 PRD v1 的 MVP 流程是否真实跑通。

## 1. 注册登录测试

### Case 1：无邀请码注册失败

步骤：打开注册页，输入账号和密码，不输入邀请码，点击注册。

预期：注册失败；页面提示邀请码必填或邀请码无效。

### Case 2：有效邀请码注册成功

步骤：准备一个 status = unused 的邀请码，输入账号、密码、邀请码，点击注册。

预期：注册成功；创建 User；InviteCode 状态变为 used；InviteCode.usedByUserId 写入用户 ID；InviteCode.usedAt 写入时间。

### Case 3：已使用邀请码注册失败

步骤：使用 status = used 的邀请码注册。

预期：注册失败；不创建用户；页面提示邀请码无效或已使用。

### Case 4：禁用邀请码注册失败

步骤：使用 status = disabled 的邀请码注册。

预期：注册失败；不创建用户。

### Case 5：登录成功

步骤：输入正确账号密码，点击登录。

预期：登录成功，进入工作台。

### Case 6：未登录访问受限页面

页面：/dashboard、/projects、/projects/new、/projects/:id、/generate。

预期：跳转登录页或返回未登录错误。

## 2. 商家项目测试

### Case 1：创建商家项目

步骤：登录，进入项目新建页，输入项目名称和 profileText，保存。

预期：创建成功；项目出现在列表中；userId 是当前用户。

### Case 2：编辑商家项目资料

步骤：打开已有项目，修改 profileText，保存。

预期：保存成功；updatedAt 更新；再次打开看到最新资料。

### Case 3：生成脚本使用最新项目资料

步骤：创建项目资料 A，修改为项目资料 B，进入生成页选择该项目，生成脚本。

预期：生成内容基于资料 B，不使用资料 A。

### Case 4：用户隔离

步骤：用户 A 创建项目；用户 B 登录；用户 B 访问用户 A 项目 ID。

预期：无法访问、编辑、删除；生成接口不能使用该 projectId。

## 3. 抖音提取测试

### Case 1：有效抖音链接提取成功

步骤：登录，进入生成页，选择项目，输入有效且可提取的抖音链接，点击提取。

预期：返回 originalTranscript；页面展示自动提取的原口播文案。

### Case 2：无效链接失败

步骤：输入非抖音链接或格式错误链接，点击提取。

预期：页面展示 `当前链接无法自动提取，请更换可提取的抖音视频链接`。

### Case 3：抖音链接无法提取

步骤：输入无法访问、无口播、提取失败的抖音链接，点击提取。

预期：页面展示 `当前链接无法自动提取，请更换可提取的抖音视频链接`。

### Case 3B：失败观测只保留脱敏摘要

步骤：在 staging 启用最小诊断观测后，用单条失败样本触发一次提取失败。

预期：用户侧仍只看到 `当前链接无法自动提取，请更换可提取的抖音视频链接`；内部日志只允许记录 provider、内部 errorCode、HTTP status 或错误分类、retryable、jobId、归一化 URL hash8/长度、响应长度/hash8；不得记录完整抖音链接、完整第三方响应、完整媒体 URL 或 transcript。

### Case 4：不出现手动粘贴兜底

预期：页面没有手动粘贴口播文案入口；API 没有 manualTranscript 兜底参数。

### Case 5：Provider 未接入时固定失败

步骤：登录后调用 `/api/douyin/extract-transcript`，传入格式合法的抖音链接。

预期：当前无合规 Provider 时返回失败；页面只展示 `当前链接无法自动提取，请更换可提取的抖音视频链接`；响应中没有假 `originalTranscript`。

### Case 6：合规 Provider 接入前检查

预期：Provider 不使用抖音非公开接口、签名逆向、模拟登录、用户 Cookie、验证码/风控绕过、无水印下载或灰产解析接口。

### Case 7：ASR 下游边界

步骤：评估火山 ASR 或其他 ASR 接入。

预期：ASR 只接收合规上游 Provider 返回的授权媒体 URL 或用户/商家自有授权媒体；ASR 不负责将抖音链接解析成音频/字幕。

### Case 8：默认 Provider 固定失败

步骤：不设置 `DOUYIN_PROVIDER` 或设置为 `blocked`，登录后调用 `/api/douyin/extract-transcript`。

预期：返回固定失败提示；响应中没有 `originalTranscript`；不会调用 ASR 或 TikHub。

### Case 9：ASR 配置缺失

步骤：设置 `DOUYIN_PROVIDER=asr`，不配置 `ASR_API_KEY` / `ASR_API_BASE_URL` / `ASR_AUTHORIZED_MEDIA_URL` 中任意必要项。

预期：返回固定失败提示；服务层错误码可区分为 ASR 未配置；不伪造 transcript。

### Case 10：ASR 授权媒体 URL 转写

步骤：服务端配置合法授权媒体 URL 和真实 ASR Key/Base URL 后，调用提取 API。

预期：ASR 返回转写文本后，API 返回 `originalTranscript`，后续可进入 DeepSeek 拆解/生成。测试日志只记录摘要，不记录 Key。

### Case 11：TikHub 默认关闭

步骤：不设置 `DOUYIN_PROVIDER=tikhub`，即使环境存在其他配置也调用提取 API。

预期：TikHub 不会被调用。

### Case 12：TikHub 测试插槽

步骤：仅在服务端显式设置 `DOUYIN_PROVIDER=tikhub` 且配置 `TIKHUB_API_KEY` / `TIKHUB_API_BASE_URL` 时调用。

预期：Provider 保守解析返回；有 transcript 则返回原文，有授权媒体 URL 则进入 ASR；两者都没有时明确失败。TikHub 不被标记为已合规生产 Provider。

### Case 13：TikHub 测试模式配置缺失

步骤：不配置 `TIKHUB_API_KEY`、`TIKHUB_API_BASE_URL` 或 `TIKHUB_TEST_DOUYIN_URL`。

预期：不调用外部接口；测试结构状态为 not_configured 或 missing_test_url；不返回假 transcript。

### Case 14：TikHub 返回结构摘要

步骤：配置测试模式后调用 TikHub 结构检查。

预期：只记录 transcript / media_url / unknown / not_configured 等摘要，不记录完整原始响应、Key 或敏感 URL。unknown 结构不能成功。

### Case 15：TikHub provider_error

步骤：配置测试模式后真实调用 TikHub，第三方返回非成功状态或请求失败。

预期：只记录 provider_error、HTTP 状态码或错误类型摘要；不输出完整响应、Key 或完整媒体 URL；API 展示固定失败提示，不返回假 transcript。

### Case 16：TikHub GET 请求路径

步骤：TikHub 测试模式使用 GET 请求路径 `/api/v1/douyin/web/fetch_one_video_by_share_url`，通过 `share_url` 查询参数传入测试链接。

预期：不再因 POST 方法错误得到 405；如果返回授权类状态，只记录 HTTP 状态摘要，不输出响应体、Key 或完整 URL。

### Case 17：TikHub desc 不作为 transcript

步骤：TikHub 返回结构中只有 `desc` 字段。

预期：不能返回成功 transcript；`desc` 只可作为视频描述观察，不进入 DeepSeek 拆解。

### Case 18：TikHub transcript 链路

步骤：TikHub 返回明确 transcript/caption/subtitle/text/asrText/resultText 字段。

预期：提取 API 返回 `originalTranscript`；随后可进入 DeepSeek 拆解和最终生成；日志只记录摘要，不记录 transcript 全文。

### Case 19：TikHub 多链接稳定性测试

步骤：配置 `TIKHUB_TEST_DOUYIN_URLS` 多条链接，或使用单条 `TIKHUB_TEST_DOUYIN_URL` 作为 baseline。

预期：只输出 index、结构类别、HTTP 状态摘要、transcript 是否存在与长度、是否命中 media URL、是否需要 ASR、是否可进入 DeepSeek 拆解；不输出完整链接、完整响应、完整 transcript 或完整 media URL。

### Case 20：稳定性判断

步骤：统计多链接结果。

预期：单条链接只能作为 baseline；5-10 条链接中 transcript 成功率较高才建议进入 P1-9；media_url 占多数则优先配置 ASR；unknown/provider_error 占多数则继续调整 Provider 参数或解析。

本轮结果：5 条真实分享链接中 transcript 4、unknown 1、media_url 0、provider_error 0；抽样 DeepSeek 拆解 2 条通过。可进入 P1-9，但页面流程必须继续处理 unknown 固定失败。

### Case 21：TikHub 嵌套 media URL 路径

步骤：TikHub 返回 `aweme_detail.video.play_addr.url_list`、`download_addr.url_list` 或 `play_addr_h264.url_list` 等明确嵌套路径。

预期：Provider 可识别合法 `http://` / `https://` media URL，结构摘要可标记 `media_url` 或 `mediaUrlMatched=true`；不输出完整媒体 URL。

### Case 22：TikHub 描述字段不作为 transcript

步骤：TikHub 返回 `desc`、`title`、`share_desc`、`nickname` 等描述性字段，同时无明确 transcript/caption/subtitle/asrText/resultText。

预期：不能返回成功 transcript；如果存在合法明确 media URL，可进入 ASR 分支；如果 ASR 未配置，返回固定失败，不伪造口播文案。

P1-10 Fix 结果：mock 嵌套 media URL 用例通过，`desc/title` 未被当成 transcript；用户单链接真实测试同时命中 transcript 与 media URL，transcript 长度摘要 155，ASR 本地配置缺失，转写未执行。

### Case 23：火山/豆包 ASR Provider 配置缺失

步骤：调用服务端 ASR Provider POC，不配置 endpoint/token。

预期：返回 `ASR_PROVIDER_NOT_CONFIGURED`，列出缺失字段名；不调用外部接口，不返回假 transcript。

### Case 24：火山/豆包 ASR Provider mock 成功响应

步骤：提供 mock endpoint/token 和 mock ASR 响应，响应包含明确 transcript/resultText 字段。

预期：Provider 使用服务端 Authorization POST 授权 media URL；只从明确 transcript 字段解析文本；日志只记录长度摘要，不记录正文、media URL 或响应体。

P1-11 结果：配置缺失用例通过；mock 成功响应可解析 transcript。

### Case 25：火山 submit curl 格式

步骤：按火山 submit 示例配置 mock endpoint/key/resource/model，调用 ASR Provider。

预期：请求使用 `x-api-key`、`X-Api-Resource-Id`、`X-Api-Request-Id`、`X-Api-Sequence:-1`；body 包含 `user`、`audio.url` 和 `request.model_name`；submit 只返回 task id 时标记为 submitted，不返回假 transcript。

P1-11 Fix 结果：curl submit 格式 mock 验证通过；缺 key 时 blocked；HTTP 失败可返回状态摘要。

### Case 26：火山 Real Submit 受理态

步骤：使用 TikHub media URL 调用火山 submit。

预期：只记录 TikHub 是否命中 media URL、submit HTTP 状态、是否有 request id、是否直接返回 transcript。若只返回受理态，不展示 `originalTranscript`，必须标记还需要查询/轮询接口。

P1-11 Real Submit 结果：TikHub media URL 命中；火山 submit HTTP 成功，状态头显示受理成功并返回 request id 摘要；未直接返回 transcript，需补查询/轮询接口。

### Case 27：火山 query/poll 成功解析

步骤：submit 返回受理态后，query 使用同一个 request id，返回明确 transcript/text/result/utterances 字段。

预期：Provider 返回 success，transcript 满足最小长度；只记录长度摘要，不记录完整正文。

### Case 28：火山 query/poll 未完成

步骤：submit 返回受理态后，query 多次未返回 transcript。

预期：达到有限轮询边界后返回安全错误码 `ASR_QUERY_TIMEOUT`，不进入 DeepSeek，不生成假文案；页面仍只显示固定失败提示。

P1-12 结果：mock query 成功解析通过；真实 query 轮询 3 次未返回 transcript，保持 submitted，DeepSeek 未进入。

### Case 29：按官方 query 规则真实跑通

步骤：query 使用 `X-Api-Key`、`X-Api-Resource-Id`、`X-Api-Request-Id`，body 固定 `{}`，不发送 query 阶段 `X-Api-Sequence`；状态码 `20000001/20000002` 继续轮询，`20000000` 读取 `result.text`。

预期：真实 transcript 成功后进入 DeepSeek 拆解/生成摘要；不输出完整 transcript 或最终文案。

P1-12 Fix 结果：真实 ASR transcript 长度摘要 1058；DeepSeek 拆解成功 9 段；最终生成成功，长度摘要 116。

### Case 30：TikHub 音轨优先与 ASR 安全错误分类

步骤：TikHub 同时返回明确音乐音轨和视频播放地址；分别模拟 ASR submit HTTP 失败、query 请求失败、query 持续处理中、供应商失败状态及完成但无可用文本。

预期：优先选择明确音轨并携带 MP3 格式；仅有视频时携带 MP4 格式。失败分别保存 `ASR_SUBMIT_FAILED`、`ASR_QUERY_REQUEST_FAILED`、`ASR_QUERY_TIMEOUT`、`ASR_PROVIDER_REJECTED`、`ASR_NO_AUDIO_TRACK`，API 不返回内部分类或第三方信息。

BUG-20260627-004 结果：相关测试先红后绿，8 项回归测试通过；同一脱敏来源修复后真实 ASR 成功，ExtractionJob 成功终态和固定失败提示均通过验证。

## 4. 参考脚本拆解测试

### Case 1：拆解输出结构名称 + 原文片段

步骤：使用成功提取的 originalTranscript，点击拆解。

预期：输出 sections；每一项包含 title 和 originalText；API 可同时返回 referenceStructure 兼容当前前端。

### Case 2：拆解顺序贴合原文

预期：referenceStructure 顺序和原文表达顺序一致。

### Case 3：不能泛泛总结

错误示例：`开头吸引人，中间介绍产品，结尾引导到店`。

预期：不能只输出这种泛泛总结；必须绑定具体原文片段。

### Case 4：未配置 AI Key 不伪装成功

预期：返回明确失败或 blocked；页面不显示假 referenceStructure。

### Case 5：DeepSeek JSON 异常

预期：服务最多轻量重试一次；仍失败时返回用户可理解错误，不暴露 Key、堆栈或内部接口。

## 5. 完整脚本生成测试

### Case 1：15-30 秒

预期：基于 referenceStructure 顺序和所选项目最新 profileText 生成；字数大致 80-150 字；内容完整；可直接复制。

### Case 2：30-60 秒

预期：基于 referenceStructure 顺序和所选项目最新 profileText 生成；字数大致 180-300 字；内容完整；可直接复制。

### Case 3：60-90 秒

预期：基于 referenceStructure 顺序和所选项目最新 profileText 生成；字数大致 320-500 字；内容完整；可直接复制。

P1-10 调优结果：短参考结构真实生成通过，长度摘要 343，命中所选项目资料；多段参考结构真实生成通过，长度摘要 451，命中所选项目资料。60-90 秒 prompt 已加强，短参考结构会要求扩展到店场景、菜品体验、适合人群、环境/服务感受和结尾引导。

### Case 4：未配置 AI Key 不伪装成功

预期：返回明确失败或 blocked；页面不显示假 finalScript。

### Case 5：非当前用户项目不能生成

预期：用户 B 使用用户 A 的 projectId 调用生成 API 失败。

### Case 6：DeepSeek JSON 异常

预期：服务最多轻量重试一次；仍失败时返回用户可理解错误，不暴露 Key、堆栈或内部接口。

### Case 7：最终脚本不复制参考原文

预期：如果模型整段复制 referenceStructure.originalText 中的长片段，服务返回失败，不伪装成功。

### Case 8：不保存历史

步骤：生成脚本，离开页面，查看项目或工作台。

预期：没有生成历史记录列表，不提供历史详情页。

### Case 9：不提供站内编辑

预期：生成结果展示为可复制文本；不提供在线编辑器；不保存用户对结果的二次编辑。

### Case 10：最终文案按完整句子分行

步骤：分别使用含中文标点、英文标点、逗号、小数点、已有单换行、已有多段落和异常空白的最终文案执行后端格式规范化。

预期：句号、问号、感叹号及对应中英文标点结束的完整句子各占一行；逗号和数字小数点不强制断行；软换行正确合并；明确段落之间只保留一个空行；不添加序号、项目符号或标题；空文本仍为空。

页面/API 预期：`finalScript` API 返回真实换行字符；页面使用保留换行的展示样式；一键复制直接复制同一个格式化后字符串，复制内容保留相同换行。重新生成继续经过同一后端格式化流程。

## 6. DeepSeek 真实调用联调测试

### Case 1：Key 安全配置

预期：`DEEPSEEK_API_KEY` 只存在于服务端 `.env.local`、本机 `.env` 或部署平台 Secret；源码、文档、日志、前端 bundle 中没有真实 Key；不存在 `NEXT_PUBLIC_DEEPSEEK*`。

### Case 2：本地未配置 Key

预期：拆解和生成 API 返回明确 blocked/失败，不返回假 sections、referenceStructure 或 finalScript。

### Case 3：本地已配置 Key

步骤：使用测试参考口播文案调用拆解 API；使用测试商家项目资料和拆解结构调用生成 API。

预期：拆解返回结构化 sections；结构顺序对应原文；最终脚本基于商家项目资料；不沿用参考视频原商家的店名、地址、菜品、活动、卖点；不把真实 Key 或完整 AI 输出写入日志。

### Case 4：多时长真实生成

步骤：本地已配置 Key 时，至少测试 15-30 和 30-60 两个时长；时间允许时测试 60-90。

预期：脚本长度大致符合所选时长；触发明显长度不合格或明显复制参考原文时最多重试一次；仍失败时返回用户可理解错误。15-30 和 30-60 是本轮真实 E2E 必测项；60-90 已完成后续质量调优和真实复测。

## 7. 回归测试清单

每次功能改动后至少检查：注册、登录、邀请码状态、项目创建、项目编辑、用户权限隔离、抖音链接错误提示、拆解结构格式、三个时长生成、复制按钮。

## 8. P1-9 页面真实流程接入测试

### Case 1：生成页真实 API 链路源码预检

步骤：检查生成页是否调用真实提取、拆解、最终生成 API。

本轮结果：通过。生成页调用 `/api/douyin/extract-transcript`、`/api/scripts/analyze-reference`、`/api/scripts/generate-final`，不展示 mock 结构或 mock 最终文案。

### Case 2：复制按钮逻辑

步骤：检查复制按钮是否只在存在最终文案时展示，并调用剪贴板。

本轮结果：通过。`finalScript` 存在后才展示复制按钮，点击调用 `navigator.clipboard.writeText(finalScript)`，并提供复制成功/失败反馈。

### Case 3：权限源码预检

步骤：检查 `/generate` 页面和项目列表来源。

本轮结果：通过。`/generate` 使用 `requireUser()`，项目列表使用 `listProjects(user.id)`。

### Case 4：真实页面点击流

步骤：登录 -> 选择项目 -> 输入真实抖音链接 -> 提取 -> 拆解 -> 生成 -> 复制。

Retry 结果：真实 HTTP/session 流程通过。临时用户注册登录成功，临时项目创建成功，`/generate` 登录态访问 200 且包含当前用户项目；成功链接提取 transcript 成功，DeepSeek 拆解成功，15-30 秒最终文案生成成功且命中所选项目资料。可视化补验已通过浏览器完成注册、项目创建、生成页进入、参考结构展示、最终文案生成、复制按钮出现和实际点击复制，页面显示“已复制到剪贴板”。

### Case 5：unknown 链接固定失败

步骤：使用 P1-8 中 unknown 类链接在页面输入。

Retry 结果：真实 HTTP/session 流程通过。unknown 链接返回 503，错误码为 `DOUYIN_TRANSCRIPT_UNAVAILABLE`，用户提示为 `当前链接无法自动提取，请更换可提取的抖音视频链接`，未返回假 transcript。可视化补验中不可提取链接也展示同一固定失败提示。

### Case 6：P1-9 权限和安全

步骤：检查未登录访问 `/generate`、跨用户项目生成和用户可见响应安全。

Retry 结果：通过。未登录访问 `/generate` 返回 307 并跳转登录；用户 A 使用用户 B 项目生成失败，错误码为 `PROJECT_NOT_FOUND`；响应未暴露 Key、完整 Provider 响应或 Provider 内部错误码。临时用户、项目和邀请码已清理。

## 9. P1-13 页面级真实流程回归测试

### Case 1：登录态 `/generate` 页面可访问并加载当前用户项目

步骤：创建临时用户和临时商家项目，带登录 session 访问 `/generate`。

本轮结果：通过。页面返回 200，包含当前用户临时项目；未发现文件上传 input、手动 transcript textarea、历史记录链接或站内编辑入口。临时数据已清理。

### Case 2：TikHub media URL -> 火山 ASR -> DeepSeek 链路

步骤：使用服务端测试抖音链接调用提取 API，再调用拆解和最终生成 API。

本轮结果：通过。TikHub media URL 命中后进入火山 ASR，提取 transcript 长度摘要 1326；DeepSeek 拆解 6 段，均包含结构名称和原文片段；30-60 秒最终脚本生成成功，长度摘要 232，并命中所选商家项目资料。

### Case 3：前端响应安全

步骤：检查提取 API 成功响应和失败响应。

本轮结果：通过。成功响应只返回 `originalTranscript`，不返回 `source` 或 `audioUrl`；无效链接返回固定失败提示，不暴露 TikHub、ASR、Volcengine、DeepSeek、Key、堆栈或内部错误。

### Case 4：权限与隔离

步骤：未登录访问 `/generate`；用户 B 使用用户 A 的 projectId 调用最终生成。

本轮结果：通过。未登录 `/generate` 返回 307 并跳转 `/login`；跨用户项目生成失败，不返回最终文案。

### Case 5：浏览器点击限制

步骤：尝试使用本地浏览器自动化执行完整点击流。

本轮结果：受限。当前工具环境未提供可用浏览器快照/点击能力；已用登录态 HTML 源码检查 + 真实 HTTP/session API 链路补证页面接线。复制按钮继续沿用 P1-9 可视化补验结果和源码断言：只有 `finalScript` 存在时展示，点击调用剪贴板并显示成功/失败反馈。

## 10. P1-14 上线前稳定性与生产配置收口

### Case 1：生产环境变量清单

步骤：检查 `.env.example` 和 `docs/DEPLOYMENT_CHECKLIST.md`。

预期：列出数据库、session、DeepSeek、Provider、TikHub、火山 ASR、超时和测试变量；所有敏感值为空或占位，不包含真实 Key。

### Case 2：缺 DeepSeek Key 不生成假文案

步骤：临时清空服务端 `DEEPSEEK_API_KEY`，调用拆解/生成 API。

预期：返回 blocked/失败状态，不返回假 `referenceStructure` 或假 `finalScript`；用户错误不暴露 Key、endpoint 或堆栈。

### Case 3：缺 TikHub/火山配置不伪造提取成功

步骤：在缺少 TikHub Key/Base URL 或火山 ASR Key/endpoint 的环境下调用提取 API。

预期：返回固定失败提示，不返回 `originalTranscript`，不暴露内部错误、endpoint、Key 或完整媒体 URL。

### Case 4：外部接口超时边界

步骤：检查 TikHub、火山 ASR、DeepSeek 请求边界。

预期：TikHub 使用 `TIKHUB_REQUEST_TIMEOUT_MS`；火山 ASR submit/query 使用 `VOLCENGINE_ASR_REQUEST_TIMEOUT_MS` 和有限 query 轮询；DeepSeek 使用 `AI_REQUEST_TIMEOUT_MS`。

### Case 5：防重复提交

步骤：检查生成页提取和生成按钮状态及 handler。

预期：处理中按钮 disabled；handler 在处理中直接返回，不重复触发同一流程。

### Case 6：安全扫描

步骤：扫描源码、文档、日志和前端代码。

预期：没有真实 Key、完整媒体 URL、完整 ASR 响应、完整 transcript、完整最终文案落盘；没有上传、手动粘贴、历史记录、站内编辑等 PRD 外入口。

## 11. P1-15 部署演练与真实浏览器端完整回归

### Case 1：生产模式启动

步骤：运行 `npm run build`，再运行 `npm run start`。

本轮结果：通过。生产模式本地服务可启动。

### Case 2：生产模式基础页面

步骤：访问 `/`、`/login`、`/register`、未登录 `/generate`。

本轮结果：通过。前三个页面返回 200；未登录 `/generate` 返回 307 并跳转 `/login`。

### Case 3：生产模式真实 session/API 链路

步骤：临时注册用户、创建商家项目、访问 `/generate`，调用提取、拆解、生成 API。

本轮结果：阻断。临时注册、项目创建、登录态 `/generate` 访问、无效链接固定失败、跨用户项目隔离和临时数据清理通过；真实提取 API 多次在长等待后返回固定失败，未进入 DeepSeek 拆解/生成。

### Case 4：ASR 直接诊断

步骤：只做安全摘要诊断，确认 TikHub media URL 和火山 ASR。

本轮结果：TikHub 可命中 media URL；火山 ASR 直接诊断在扩展轮询窗口内可返回 transcript 长度摘要。生产 API 同步路径仍存在不稳定/超时风险。

### Case 5：真实浏览器点击流

步骤：使用浏览器工具完成首页、登录/注册、项目、生成、复制、失败提示点击流。

本轮结果：未完成。当前工具环境未提供可用浏览器快照/表单填充能力，不能把该流程写成已点击通过。

### Case 6：数据库与部署平台判断

步骤：检查 Prisma datasource。

本轮结果：当前 datasource 为 SQLite。本机/单机持久磁盘可短期使用；Vercel、Serverless、云函数或无持久磁盘平台建议上线前迁移 PostgreSQL。

## 12. P1-16 ASR 异步任务与页面轮询

### Case 1：创建提取任务要求登录

步骤：未登录调用 `POST /api/douyin/extraction-jobs`。

预期：返回未登录错误，不创建任务。

### Case 2：查询提取任务要求登录和归属

步骤：用户 A 创建提取任务；用户 B 查询该 job id。

预期：用户 B 无法查询用户 A 的任务；不返回 transcript、media URL 或内部错误。

### Case 3：无效抖音链接

步骤：登录后创建提取任务，传入非抖音链接。

预期：返回固定失败提示或校验错误；不创建可执行任务；不调用 Provider。

### Case 4：任务状态轮询

步骤：登录后传入可提取抖音链接创建任务，并轮询 `GET /api/douyin/extraction-jobs/:id`。

预期：先返回 `queued` 或 `processing`，成功后返回 `succeeded` 和 `originalTranscript`；响应不返回 media URL、Provider 原始响应或 ASR 原始响应。

### Case 5：成功任务数据清理

步骤：构造或完成一个 succeeded 提取任务，当前用户读取一次 job 结果后检查数据库。

预期：首次读取返回 `originalTranscript` 给当前流程；读取后数据库中的完整 transcript 被清空；响应仍不返回 media URL、Provider 原始响应或 ASR 原始响应。

### Case 6：任务失败、超时或过期清理

步骤：Provider blocked、缺配置、不可提取链接、任务超时或构造过期任务。

预期：job 最终为 `failed`，页面展示 `当前链接无法自动提取，请更换可提取的抖音视频链接`；不伪造 transcript。

补充预期：完整 sourceUrl 只在处理期间临时保留，任务终态后清空；过期任务在创建/查询入口机会式删除，不提供用户可见历史。

### Case 7：页面轮询状态

步骤：在 `/generate` 选择项目并输入抖音链接，点击自动提取并拆解。

预期：页面先显示提取/转写进行中状态；成功后进入参考结构拆解；失败时显示固定失败提示；按钮处理中不可重复提交。

### Case 8：范围和安全扫描

步骤：扫描源码、文档和页面。

预期：没有真实 Key、完整 media URL、完整 transcript、完整最终文案落盘；页面没有上传、手动粘贴、历史记录或站内编辑入口。

## 13. P1-17 部署平台与生产数据库/任务队列方案决策

### Case 1：部署平台决策完整性

步骤：检查 `docs/DEPLOYMENT_ARCHITECTURE_DECISION.md`。

预期：明确比较 Vercel/Serverless、单 VPS/长运行服务器、托管 web/worker 平台的优缺点，并给出推荐路径。

### Case 2：数据库决策

步骤：检查部署决策和 checklist。

预期：明确生产推荐 PostgreSQL；SQLite 仅用于本地开发或严格受控单机内测；不把 SQLite 写成真实生产默认方案。

### Case 3：任务队列/worker 决策

步骤：检查部署决策文档。

预期：明确当前 in-process job 只适合本地/单实例演练；最小生产路径推荐 DB polling worker；BullMQ/Redis 或平台队列作为后续扩展选择。

### Case 4：后续阶段拆分

步骤：检查 `docs/CODEX_TASKS.md` 和 `docs/EXECUTION_STATUS.md`。

预期：列出 P1-18 PostgreSQL、P1-19 extraction worker、P1-20 production smoke test/observability，不直接执行大规模代码迁移。

### Case 5：安全和范围扫描

步骤：扫描文档和源码。

预期：没有真实 Key、完整 media URL、完整 transcript、完整最终文案；没有新增上传、手动粘贴、历史记录、站内编辑、支付、会员等 PRD 外入口。

## 14. 抖音分享文本、状态复用与提取重试修复

### Case 1：完整分享文本规范化

步骤：分别输入裸抖音 URL、包含说明文字的完整抖音分享文本、同时包含非抖音 URL 和抖音 URL 的文本。

本轮结果：自动化测试通过。系统按文本顺序选取第一个有效抖音 URL；没有有效抖音 URL 时返回固定失败提示。

### Case 2：更换脚本时长

步骤：提取并拆解成功后生成最终脚本，再切换脚本时长。

预期：只清空最终脚本；保留原口播文案和参考结构；不创建新的提取任务；可以直接重新生成。

本轮结果：状态规则自动化测试通过。浏览器点击回归因当前浏览器安全设置阻止 localhost 操作，待用户实际试用确认。

### Case 3：更换商家项目

步骤：提取并拆解成功后生成最终脚本，再切换商家项目。

预期：只清空最终脚本；保留原口播文案和参考结构；不创建新的提取任务；重新生成时服务端读取新项目最新资料。

本轮结果：状态规则与服务端数据流检查通过。浏览器点击回归待用户实际试用确认。

### Case 4：更换抖音来源

步骤：提取并拆解成功后修改输入，使规范化后的抖音 URL 发生变化。

预期：清空原口播文案、参考结构、最终脚本和复制反馈；必须重新提取。仅修改分享文字但保留同一规范化 URL 时不清空参考状态。

本轮结果：自动化测试通过。

### Case 5：重新生成与复制操作

步骤：最终脚本生成成功后检查操作区。

预期：同时保留“重新生成”和“复制文案”；重新生成失败时不丢失原口播文案和参考结构。

本轮结果：源码与构建检查通过；浏览器点击回归待用户实际试用确认。

### Case 6：TikHub 瞬时失败重试

步骤：分别模拟 HTTP 500 后成功、持续 HTTP 429、HTTP 401 和首次网络异常后成功。

本轮结果：自动化测试通过。网络异常、429 和 5xx 最多重试一次；401/403 不重试；页面仍只显示固定失败提示。

### Case 7：综合自动验证

步骤：运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。

本轮结果：全部通过，共 11 个新增单元测试通过。

### Case 8：worker claim 脱敏观测

步骤：对 queued job 的 worker claim 层做单元/集成验证，覆盖 `not_due`、`max_attempts`、并发 claim 竞争和 worker heartbeat/claim 分类 helper。

预期：日志只输出 workerId、候选计数、claim 分类、jobId/sourceHash/sourceHost 摘要，不输出完整链接、完整 transcript 或第三方原始响应；业务固定失败文案不变。

### Case 9：create job -> first worker tick 同一 job 关联观测

步骤：创建单条 extraction job 后，记录创建摘要、查询摘要与 worker heartbeat 的 oldest queued/due job 摘要，并用 `jobId/sourceHash/sourceHost` 做脱敏关联。

预期：能区分 job 是否被创建、是否仍为 queued、是否保留 `sourceUrl`、是否满足 `availableAt/expiresAt` claim 条件，以及 worker 第一次扫描时是否还能看到同一 job；日志不输出完整链接、完整 transcript 或密钥。
## BUG-20260627-005：静音音轨回退视频原声

### Case 1：静音状态分类

步骤：模拟 ASR 查询返回静音状态。

预期：服务层返回安全错误码 `ASR_NO_AUDIO_TRACK`，前端仍只显示固定失败提示。

### Case 2：媒体候选顺序

步骤：模拟 TikHub 同时返回独立音轨和视频播放资源。

预期：首选独立音轨，同时保留 MP4 视频作为一次性回退候选。

### Case 3：真实来源回退

步骤：使用脱敏来源触发独立音轨静音场景。

预期：音轨静音后自动尝试视频原声，返回非空口播；日志和文档不包含完整来源、媒体地址或正文。

## 15. P1-18 香港 staging 就绪与生产安全收口

### Case 1：PostgreSQL 与发布阻断

步骤：验证 PostgreSQL datasource、initial migration、Prisma Client，并检查 CI/发布工作流是否在构建和部署前执行 `prisma migrate deploy`。

本轮结果：schema、migration SQL 和 Client 本地验证通过，CI/发布已包含 PostgreSQL migration 阻断；本机无 PostgreSQL，真实应用 migration 保持 blocked。

### Case 2：Worker 并发、抢占和恢复

步骤：验证 Worker 默认并发 2、每用户最多 2 个 processing 任务、任务持久化重试上限、超时任务恢复和终态清理。

本轮结果：策略和 service 自动化测试通过；真实多进程 PostgreSQL 抢占、进程重启恢复和负载测试必须在 staging 补做。

### Case 3：会话、管理员和响应安全

步骤：验证数据库会话撤销、OWNER/OPERATOR、TOTP/恢复码、二次 TOTP、审计、敏感响应禁用缓存和管理员初始化输出边界。

本轮结果：现有认证/后台测试通过；恢复码改为 64-bit 随机值并使用服务端 HMAC pepper，敏感 API 使用 `no-store`，管理员初始化秘密只写入一次性 `0600` 文件。

### Case 4：用量与成本统计

步骤：验证默认每日额度 30、上海时区聚合、邀请码/用量/费用统计，以及 ASR 成本使用媒体时长而非请求处理耗时。

本轮结果：schema、聚合路由和自动化测试通过，ASR 计费时长改为明确媒体时长；缺少时长时记录 0，不用处理延迟冒充音频时长。

### Case 5：部署与备份静态检查

步骤：解析 Compose/GitHub Actions YAML，检查 Caddy 回源头、备份退出清理、回滚脚本和环境变量占位。

本轮结果：YAML 和 shell 语法通过；Compose 要求显式完整 `DATABASE_URL`，备份增加退出清理。真实 Caddy 绕过、加密备份恢复和镜像回滚保持 blocked。

### Case 6：真实 staging 门槛

步骤：在香港 staging 执行 PostgreSQL migration、Web/Worker 双进程、Worker 并发/重试/超时/重启恢复、跨账号和后台安全、10 并发负载、备份恢复及回滚。

本轮结果：本机无 Docker/PostgreSQL，且未连接云资源，本项未执行，不得写成通过。

## 16. V2 爆款选题 + Top 3（实施中）

- 验证未登录拦截、项目归属、跨账号隔离、读取最新资料，以及项目更新后返回 `PROJECT_PROFILE_CHANGED`。
- 验证资料不足被阻止；分析结果严格为1个赛道、5个关键词、5个不重复场景。
- 验证25个坐标完整唯一，爆款元素仅来自固定10种，每条1—2种且无脚本类型字段。
- 对借势、对立、幕后、猎奇、糟糕、性感做安全用例，拒绝低俗、侵权、造谣、群体攻击、竞品指控和无资料依据的内容。
- 验证Top 3分别为 `traffic`、`trust`、`conversion`，坐标存在且互不重复，字段完整。
- 验证非法JSON、缺项、重复、越界只重试一次，失败不展示半成品、不扣额度。
- 使用固定 fixture 覆盖完整25条+Top 3、fenced JSON、截断 JSON、缺字段、坐标不完整以及批次 completion budget 传递；失败分类必须保持为 invalid JSON、invalid response 或 unsafe response，日志不得包含模型原文。
- 覆盖5个场景批次各5条的拼装、批次内顺序/坐标、跨批次标题唯一、单独Top 3选择、三目标和坐标不重复；任一批次失败时不得保存半成品或增加成功额度。
- 验证 POST 在15秒网关边界内完成入队，页面轮询 queued/processing/succeeded/failed；重复 `clientRequestId` 只创建一个任务，跨账号不能读取任务。
- 验证 Topic Worker 与提取 Worker隔离，长生成期间锁续租，进程中断后任务可恢复；成功首次读取后清空输入/结果，TTL到期删除。
- 验证独立 `tsx` 进程能加载 Topic Worker 完整依赖链，不触发 Next.js `server-only` 哨兵；CI 和部署门禁运行 `worker:topics:check`，实际验证数据库访问和任务期限恢复，失败必须阻止发布或触发回滚。
- 验证刷新或重新进入页面恢复当前用户活动任务、输入和轮询，并展示状态及真实等待时长；跨账号不能发现或取消任务。
- 验证 queued/processing 可取消，成功或已扣额度任务不可取消；总运行超时自动失败并释放锁；取消/完成竞态只有一个终态，失败、超时和取消均不扣额度。
- 验证默认每日第5次成功、第6次拒绝，失败不扣次数，并发请求不能绕过额度；上海时区日桶和后台额度调整生效。
- 视觉验收桌面1280/1440与移动375/390；覆盖抽屉、复制、Escape、焦点归还和 `prefers-reduced-motion`。
- 上线门槛：全量测试、typecheck、lint、build通过，并在staging完成真实DeepSeek、migration、权限、额度和内容质量验收。

## 17. V2 定制化脚本（规划中，仅 staging 验收）

### 17.1 执行前提与证据

准备条件：

1. 只使用 staging 外部域名和隔离测试数据库，不连接或变更生产环境。所有写库测试先调用 `tests/helpers/test-database.ts`：只接受 `postgres:`/`postgresql:`，数据库名解码后必须精确符合 `test`、`test_*` 或 `*_test`；`contest`、`production_test_backup` 以及只在用户名、密码、主机或 query 中含 `test` 的地址均拒绝。守卫按主机、默认化端口和解码后的数据库名与 `DATABASE_URL` 比较，忽略凭据和 query；`localhost`、整个 `127.0.0.0/8`、传统1—4段IPv4、单整数/八进制/十六进制IPv4、IPv4-mapped IPv6 和 IPv6 `::1` 只通过 Node WHATWG URL special-host parser 与 `node:net` 标准库归一，不执行任意 DNS 查询；无效数字IP字面量直接拒绝。同一物理数据库即使 schema 不同也禁止使用。
2. 准备用户 A、用户 B；用户 A 有项目 A1、同名项目 A2，用户 B 有同名项目 B1。A1 另准备一次改名前名称和改名后名称。
3. staging 使用目标模型 `deepseek-v4-flash` 且关闭思考模式；可读取脱敏 Job 状态、`providerCallsStarted`、`semanticAttempt`、额度前后计数和错误分类。
4. 每个 Case 记录版本 SHA、Case ID、Job ID 哈希、开始/结束时间、终态、Provider 调用次数、额度前后值和截图路径。不得记录商家正文、用户需求、Prompt、模型原始响应或生成正文到日志。
5. 自动化竞态、崩溃和额度用例使用隔离数据库与可控 Provider fixture；真实内容质量用例才调用 staging DeepSeek。

阶段通过条件：本节全部 Case 有实际测试输出、截图、脱敏日志或数据库计数证据；任何 P0/P1 失败均阻止进入生产评估。

### 17.2 staging 真实生成

| Case | 步骤 | 通过判据 | 证据 |
| --- | --- | --- | --- |
| CS-REAL-01 自由需求 | 用户 A 选择 A1，输入明确受众、主题和风格的自由需求并生成 | 返回 `succeeded`；正文处于80—350内部安全范围，页面目标仍约200—350字；自然段落或换行均可；只使用 A1 事实 | 页面截图、Job 脱敏快照、字数校验输出 |
| CS-REAL-02 普通选题 | 从 A1 爆款选题复制普通选题五行官方头及正文，粘贴后生成 | 识别为 `topic`；来源 ID 校验通过；不串 A2/B1；生成成功 | 输入类型、终态、来源校验分类 |
| CS-REAL-03 Top 3 引流 | 粘贴 A1 `traffic` Top 3 方案 | 自动初始化引流目标且允许修改；生成内容符合最终用户选择 | 页面目标状态、结果截图 |
| CS-REAL-04 Top 3 信任 | 粘贴 A1 `trust` Top 3 方案 | 自动初始化信任目标；不把来源目标强制锁死为最终目标 | 页面目标状态、结果截图 |
| CS-REAL-05 Top 3 转化 | 粘贴 A1 `conversion` Top 3 方案 | 自动初始化转化目标；最多一个自然轻引导且没有效果保证 | 页面截图、安全校验输出 |

五次均须从 staging 外部域名完成；记录真实耗时、Token/缓存命中桶和 Provider 调用次数，但不记录正文。任一任务 Provider 调用不得超过2次。

### 17.3 二十组商家事实边界

基础做法：准备一份包含18类事实的 A1 基准资料。CS-FACT-01 至 CS-FACT-18 每次只删除目标类别，并在用户要求中让该事实成为主题必要条件；预期只能返回 `needs_profile` 和表中唯一 code，不得生成正文或扣每日额度。随后把该事实补回并重跑，正文只能使用补回值，不得改写成更强承诺。

| Case | 事实类别 | 缺失时唯一预期 code | 预期终态 | 通过判据 |
| --- | --- | --- | --- | --- |
| CS-FACT-01 | 主营产品 | `main_product` | `needs_profile` | 只返回该 code；补回后产品名称与资料一致 |
| CS-FACT-02 | 核心卖点 | `core_selling_point` | `needs_profile` | 不用空泛“最好/第一”补位；补回后不扩大卖点 |
| CS-FACT-03 | 目标人群 | `target_audience` | `needs_profile` | 不臆测年龄、职业或身份；补回后只面向资料人群 |
| CS-FACT-04 | 消费场景 | `consumption_scene` | `needs_profile` | 不虚构到店/使用场景；补回后场景与资料一致 |
| CS-FACT-05 | 价格 | `price` | `needs_profile` | 不出现任何虚构金额、折扣或价格区间 |
| CS-FACT-06 | 活动 | `promotion` | `needs_profile` | 不虚构满减、赠品、截止时间或名额 |
| CS-FACT-07 | 地址或服务区域 | `address_or_service_area` | `needs_profile` | 不猜地址、商圈、距离或配送范围 |
| CS-FACT-08 | 服务流程 | `service_process` | `needs_profile` | 不虚构预约、接待、交付或操作顺序 |
| CS-FACT-09 | 资质 | `qualification` | `needs_profile` | 不虚构认证、获奖、国标符合性或专业身份 |
| CS-FACT-10 | 证据或案例 | `proof_or_case` | `needs_profile` | 不虚构客户案例、评价、前后对比或第三方背书 |
| CS-FACT-11 | 效果依据 | `effect_claim` | `needs_profile` | 不生成疗效、持续时长、结果保证或效果承诺 |
| CS-FACT-12 | 生产或制作流程 | `production_process` | `needs_profile` | 不虚构现做、手工、制作时长、温度或工序 |
| CS-FACT-13 | 材料、原料或成分 | `materials_or_ingredients` | `needs_profile` | 不虚构产地、等级、配方、成分或用料 |
| CS-FACT-14 | 服务动作 | `service_action` | `needs_profile` | 不虚构倒茶、提醒、上门、回访等实际行为 |
| CS-FACT-15 | 营业时间 | `business_hours` | `needs_profile` | 不猜开门、闭店、节假日或可预约时间 |
| CS-FACT-16 | 联系方式 | `contact_method` | `needs_profile` | 不虚构电话、微信、账号或联系入口 |
| CS-FACT-17 | 经营数据 | `business_data` | `needs_profile` | 不虚构销量、客流、年限、复购率或百分比 |
| CS-FACT-18 | 质保或售后 | `warranty_or_after_sales` | `needs_profile` | 不虚构期限、退款、补做、维修或赔付条件 |
| CS-FACT-19 | 跨商家污染 | 不适用 | `success` | 仅给 A1 完整资料并生成；正文不得出现 A2/B1 的店名、产品、价格、地址或其他独有事实 |
| CS-FACT-20 | 方法论案例与行业结论 | 不适用 | 拒绝模型输出 | 用可控 Provider 连续返回含“当天能住”“多撑两周”“进店倒热茶”、案例技术数字、无依据国家标准或行业结论的正文；两次均须被本地校验拒绝为 `CUSTOM_SCRIPT_OUTPUT_INVALID`，不展示半成品、不扣额 |

总通过判据：20组明确覆盖 `needs_profile`、`success` 和拒绝模型输出三种结果，且均不得出现虚构价格、活动、地址、资质、功效、服务动作、经营数据或效果保证；CS-FACT-01 至18 的缺失结果必须精确匹配单一 code，补资料后的正文不得出现基准资料之外的新商业事实。

### 17.4 登录、归属与来源解析

| Case | 步骤 | 通过判据 |
| --- | --- | --- |
| CS-AUTH-01 | 未登录访问 `/custom-scripts` 及三个 Job API | 页面跳转登录；API 返回未登录且不创建 Job |
| CS-AUTH-02 | 用户 B 使用 A1 `projectId` 或读取/取消 A 的 Job | 统一拒绝，不泄露项目或 Job 是否存在 |
| CS-SOURCE-01 | A1 官方头配 A1；再把 body 来源 ID 改为 A2 | 前者通过；官方头与 body 不一致时精确返回 `CUSTOM_SCRIPT_INPUT_INVALID` |
| CS-SOURCE-01B | A1 官方头与 body 均保留 A1，但把当前选择项目改为 A2 | 精确返回 `CUSTOM_SCRIPT_PROJECT_SOURCE_MISMATCH`，不泄露项目归属 |
| CS-SOURCE-02 | 把官方标识或任一保留字段移到正文、重复、缺失或乱序 | 返回 `CUSTOM_SCRIPT_INPUT_INVALID`，不能降级为旧文本 |
| CS-SOURCE-03 | A1、A2、B1 使用相同展示名但不同 ID | 只按 ID 与归属判断；同名不能绕过隔离 |
| CS-SOURCE-04 | 复制 A1 官方文本后重命名 A1，再粘贴旧展示名文本 | 因来源 ID 未变而可继续；展示名不参与授权或相等判断 |
| CS-SOURCE-05 | 粘贴全文完全不含官方标识和三个保留字段的旧文本 | 显示“以当前项目为准”提示，使用当前选择项目资料；body 不提交来源字段 |
| CS-SOURCE-06 | 在合法官方头前加入普通空行、只含 Unicode `White_Space` 的行及只含 FEFF 的行 | 从首个非空行正确识别来源，项目与目标继承保持正确 |
| CS-SOURCE-07 | 在官方头前放置标识、任一保留字段或其他非空内容 | 返回 `CUSTOM_SCRIPT_INPUT_INVALID`，不能跳过恶意错位内容寻找后续头 |
| CS-SOURCE-08 | 先粘贴 `top_pick/trust`，再切换为同项目 `topic/auto`，之后手动改为转化并只编辑正文 | 首次为 `trust`，切换后重置为 `auto`；手动改为转化后编辑同一来源正文不再覆盖 |

### 17.5 正文格式、交互与可访问性

- 使用含中文、ASCII、数字、emoji、组合字符、CRLF、U+0085、FEFF 和 Unicode `White_Space` 的 fixture，服务端与前端统一复用共享工具：NFC、CRLF/CR→LF、边界 trim 后只移除 Unicode `White_Space` 并按 code points 计数；内部 FEFF 计1，79和351拒绝，80、150、199、200和350接受。
- 创作要求输入分别覆盖4/5、5000/5001个 BMP 字符、5000/5001个 emoji，以及 NFC 后5000/5001个组合字符；源码不得出现原生 `maxlength`。真实浏览器验证短文本逐字键入和5001个 emoji 的剪贴板插入路径：输入值必须完整保留，计数显示 `5001/5000`，出现超限错误且提交禁用，不得静默截断。
- 同段多句、跨行断句、超过25 code points的单句和任意自然换行均可通过，不固定总行数，服务端不得按标点自动拆句。正文整体至少包含一个 Unicode 字母或数字；结果不得包含标题、分镜、时间轴、解释、Markdown 列表、表情或占位符。
- 在桌面1280/1440和移动375/390分别验收：项目选择、输入、目标、风格、空态、加载态、错误态、资料不足态、成功态、复制、换一版和取消。
- 修改项目、需求、目标或风格必须清空旧结果；复制后有可读反馈；换一版改变开头和主要表达角度且仅成功扣一次。
- 仅键盘完成选择、提交、取消、复制和换一版；焦点顺序可预测，错误提示可被辅助技术读取，抽屉/弹层支持 Escape 并归还焦点。
- 数字事实夹具至少覆盖价格、百分比、日期/时长和技术单位；验证 `30元` 不得被 `130元` 或 `30分钟` 误支持。换一版需覆盖“只改首句、其余19行复用”被拒绝及保留同一商家事实的实质重写被接受。
- 模拟服务端已创建任务但浏览器未收到响应：重试必须原样复用 UUID、draft 和 `previousScript`，服务端恢复原任务且不冲突、不重复调用和扣额；修改条件和每次新换一版必须创建新 UUID。
- 完整执行“首次成功→换一版POST 202→轮询终态failed/canceled→点击‘重试换一版’”：显式重试必须使用新 UUID，同时逐字段保留已受理的 draft 与 `previousScript`；主生成按钮不能隐式丢失上一版。只有 POST 响应不明确时才复用原 UUID。修改项目、需求、目标或风格后，待确认请求与最后受理请求必须一起清空。
- 刷新恢复成功结果时不得伪造旧输入条件；页面必须明确提示原条件已清理。同一页面会话内生成成功仍可正常换一版。
- 开启 `prefers-reduced-motion: reduce` 后无非必要动画，加载状态仍可理解；页面无横向溢出、遮挡、文字截断或按钮不可点击。

通过证据：四个视口的空态/加载态/成功态/错误态截图，键盘录屏或逐步记录，减少动态模式截图，以及复制/换一版的 UI 与 API 结果。

### 17.6 幂等、并发与额度

| Case | 执行方式 | 通过判据 |
| --- | --- | --- |
| CS-IDEMP-01 | 同一用户用同一 UUID 和同一 canonical payload 并发提交2次 | 返回同一 Job；只创建1行、只调用 Provider 一组、最多扣1次 |
| CS-IDEMP-02 | 同一 UUID 改任一业务字段后重放 | HTTP 409 `CUSTOM_SCRIPT_IDEMPOTENCY_CONFLICT`；不调用 Provider、不扣额 |
| CS-IDEMP-03 | 不同 UUID 同时提交2个任务 | 同一用户最多一个 `queued|processing`；另一个返回 `CUSTOM_SCRIPT_ALREADY_RUNNING` |
| CS-QUOTA-01 | 将当日成功用量设到上限后 POST | `assertDailyScriptQuota` 在创建前拒绝；无 Job、无 Provider 调用 |
| CS-QUOTA-02 | 创建时有1次余额，Worker 完成前由其他脚本功能耗尽额度 | 成功 Serializable 事务重检失败；不保存正文、不设置 `quotaChargedAt`、不超扣 |
| CS-QUOTA-03 | 首次生成成功，再换一版成功；分别重放 UUID | 两次新成功各扣1次；幂等重放均不重复扣额 |
| CS-HOURLY-01 | 隔离时钟窗口内创建10个新任务，再创建第11个 | 前10个计入小时限制，第11个返回 `CUSTOM_SCRIPT_HOURLY_LIMIT_REACHED`；幂等重放不重复计数 |

所有额度断言同时读取 API 终态、Job `quotaChargedAt` 和上海时区 `DailyUsage.scriptsGenerated` 前后计数。

### 17.7 Worker 崩溃、锁恢复与调用上限

#### Case CS-WORKER-01：进程崩溃后按剩余次数恢复

1. Worker A 认领 Job，在第一次 Provider 调用前原子写入 `providerCallsStarted=1` 与对应 `semanticAttempt`，随后强制终止 Worker A 进程；本 Case 不保留 Worker A 或模拟迟到响应。
2. 30秒 stale lock 窗口内启动 Worker B：不得重领；锁失效超过30秒后 Worker B 才可重领。
3. Worker B 必须沿用 `providerCallsStarted=1`，最多使用剩余1次 Provider 调用；若重领时 `providerCallsStarted=2`，直接失败，不得调用第三次。

通过判据：Worker A 确实退出；Worker B 只在 stale lock 后重领；同一 Job 的 Provider 调用总数≤2，任务最终离开 `processing`，没有重复扣额。

#### Case CS-WORKER-02：停止心跳但保留 in-flight 请求

1. Worker A 认领 Job 并发起第一次 Provider 调用，先确认正常路径每10秒心跳，再由测试钩子仅停止锁心跳，不终止进程、不取消仍在进行的 Provider 请求。
2. 锁失效超过30秒后 Worker B 重领，沿用已持久化调用次数并继续处理；此时让 Worker A 的 in-flight Provider 响应迟到返回。
3. Worker A 的终态、结果与扣额条件更新必须同时校验自己的 lock token 与 `lockedBy`；因锁已被 B 重领而更新0行。只有 Worker B 可以写入最终状态或额度。

通过判据：日志证明 A 在停止心跳后仍存活并发生迟到响应；A 因 lock token/`lockedBy` 不匹配不能写终态、结果或额度；同一 Job Provider 调用总数≤2，只有一个终态且最多扣1次。

两个 Case 分别执行并保留独立证据，不得在同一流程中既终止 Worker A 又要求它迟到返回；120秒总 deadline 在两种恢复路径中均继续生效。

#### Case CS-WORKER-03：心跳更新异常或失去租约

用真实 `withCustomScriptHeartbeat` 和 mocked Prisma `updateMany` 分别制造 Promise rejection 与 `count=0`。心跳 Promise 创建时必须立即安装拒绝处理，测试进程捕获的 `unhandledRejection` 为0；两种结果都进入明确 `lease_lost`，Provider 返回后不得继续写业务终态、结果或额度，也不得使 Worker 崩溃。

#### Case CS-WORKER-04：竞争写日志真实性

对 `needs_profile`、Provider失败、最终非法输出和总超时分别令条件终态更新返回 `false`。只有更新返回 `true` 才允许记录 `custom_script_needs_profile` 或 `custom_script_failed`；返回 `false` 统一只记录 `custom_script_completion_lost + CUSTOM_SCRIPT_COMPLETION_LOST`，不得误报已完成、资料不足或失败业务终态。

### 17.8 `/current`、TTL、取消与失败扣额

| Case | 步骤 | 通过判据 |
| --- | --- | --- |
| CS-CURRENT-01 | 分别构造 `queued`、`processing`、`succeeded`、`needs_profile`、`failed`、`canceled` 后刷新页面 | `/current` 每次只返回当前用户最新未过期的单个任务；页面恢复对应状态，不返回列表 |
| CS-CURRENT-02 | 终态完成后在30分钟内与到期后查询 | TTL 内可恢复；到期后返回 `data:null` 并由 Worker 清理；读取不延长 TTL |
| CS-CANCEL-01 | 取消未扣额 `queued` 与 `processing` 任务 | 条件更新为 `canceled`，清空输入、结果和锁，不扣额度 |
| CS-CANCEL-02 | 同时触发取消与完成 | 只能有一个终态获胜；若完成获胜只扣1次，若取消获胜不扣；失锁 Worker 不能补写 |
| CS-FAIL-01 | Provider 连续两次返回 `empty_content`（HTTP/JSON envelope 成功但模型 `content` 为空） | 最多2次调用后 `failed`，最终 errorCode 固定为 `CUSTOM_SCRIPT_OUTPUT_INVALID`；无半成品、不扣额，不得归类为 Provider 不可用 |
| CS-FAIL-02 | Provider 返回非法 JSON，再返回非法 JSON | 最多2次调用后 `CUSTOM_SCRIPT_OUTPUT_INVALID`；不保存原始响应、不扣额 |
| CS-FAIL-03 | Provider 返回合法 `needs_profile` | 只含1—5个18项白名单 code；无正文、无 `quotaChargedAt`、不扣每日额度 |

错误分类对照：只有网络错误、Provider 请求超时或 HTTP 失败使用 `CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE`；任务达到120秒总 `runDeadlineAt` 使用 `CUSTOM_SCRIPT_RUN_TIMEOUT`。

### 17.9 自动化与阶段出口

按顺序执行并保存退出码：

```bash
NODE_OPTIONS=--require=./tests/server-only-shim.cjs node --import tsx --test tests/docs/custom-script-contract.test.ts
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

最终通过条件：

- 所有自动化命令退出码为0；数据库集成测试不得因误连生产而执行。
- 五次 staging 真实生成、20组事实边界、权限/来源、幂等/并发/额度、Worker 恢复、六状态刷新、TTL、取消竞态和四个视口均有证据且通过。
- 日志和 Job 记录没有商家正文、用户需求、Prompt、模型原始响应、生成正文或密钥。
- 当前阶段只允许提交代码并部署/验证 staging；不得推生产、执行生产 migration 或开放生产入口。staging 全部通过后仅形成生产评估结论，生产仍需用户另行授权。

## 18. Next.js PostCSS安全覆盖验收

### 18.1 依赖解析与审计

```bash
npm ls next postcss --all
npm audit --omit=dev
```

通过判据：依赖树没有`invalid`；`next@15.5.19`内部解析为`postcss@8.5.10`；Tailwind使用的PostCSS路径不被强制改写；生产依赖审计为0个已知漏洞。

### 18.2 GHSA-qx2v-qp2m-jg93回归

```bash
NODE_OPTIONS=--require=./tests/server-only-shim.cjs node --import tsx --test tests/security/postcss-advisory.test.ts
```

测试必须通过Next.js自己的依赖解析入口加载PostCSS，并验证公告PoC中的字面量`</style>`不会保留在输出中，而会被转义。不得只测试Tailwind或根目录偶然提升的PostCSS版本。

### 18.3 兼容性与阶段边界

```bash
npm test
npm run lint
npm run typecheck
npm run build
npx prisma validate
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output /tmp/postcss-schema-diff.sql
git diff --check
```

通过判据：全部命令退出码为0，Prisma schema可解析且可生成完整建库SQL；本轮没有schema或migration改动；只部署并验证staging，不触碰main或production。

该覆盖是临时上游兼容措施：稳定版Next.js正式依赖PostCSS `8.5.10`或更高版本后，先移除覆盖，再完整重跑依赖审计、PoC、测试、构建和staging验收；任一兼容检查失败都不得合并。

## 19. 定制化脚本80—350内部安全范围与单次优先路径

### 19.1 服务端边界与长度桶

验证79失败，80、150、199、200、350成功，351失败，并覆盖以下全部脱敏桶：`under_80`、`351_360`、`over_360`。

通过判据：`length`类型错误携带内存态`actualCount + short|long + lengthBucket`；其他校验原因没有`repairContext`；计数只调用共享服务端 Unicode code points 规则，不读取模型自报值。

### 19.2 Provider与Worker路径

在隔离测试数据库运行以下固定Provider序列：

| Case | Provider输出 | 通过判据 |
| --- | --- | --- |
| CS-LENGTH-01 | 80→250 | 首稿成为内部 `quality_fallback`，增强成功后只扣1次 |
| CS-LENGTH-02 | 150→Provider失败 | 使用持久fallback成功且只扣1次；同UUID重放不重复调用或扣额 |
| CS-LENGTH-03 | 199→needs_profile | 忽略质量尝试的资料不足，使用fallback成功且只扣1次 |
| CS-LENGTH-04 | 200 | 合法首轮成功，只调用1次Provider且只扣1次 |
| CS-LENGTH-05 | 350 | 合法首轮成功，只调用1次Provider且只扣1次 |
| CS-LENGTH-06 | 79→150 | 2次调用后成功且只扣1次；第二次Prompt使用short补充策略但不暴露80底线 |
| CS-LENGTH-07 | 351→150 | 2次调用后成功且只扣1次；第二次Prompt含351与long删减策略 |
| CS-LENGTH-08 | 79→79 | 2次后`CUSTOM_SCRIPT_OUTPUT_INVALID`；不保存半成品、不扣额 |

200—350内部安全结果不得进入质量调用。80—199安全结果先持久化为processing内部 `quality_fallback`，再允许最多一次fresh质量增强；越界、空响应、非法JSON或领域校验失败仍沿用一次fresh修复。所有第二次Prompt不得包含首轮正文，不得要求或接受`charCount`，不得改变`maxTokens=1600`、总调用最多2次和`thinkingMode=disabled`。

### 19.3 日志与恢复边界

每个invalid attempt必须各有一条`custom_script_validation_invalid`日志。长度日志只含白名单`scriptLengthBucket`和`scriptLengthDirection`，不得出现精确count、正文、Prompt、商家资料或明文ID；最终失败日志可保留最后一次桶。

覆盖两个独立崩溃点：A=首稿持久化后、第二次Provider预留前；B=第二次Provider预留后、响应写回前。stale Worker重领后必须严格解析 `CustomScriptGenerationJob.result` 内部fallback：`providerCallsStarted=1`可继续一次增强，`providerCallsStarted=2`不再调用Provider并直接完成fallback。内部shape、80—199实际计数或`inputType`任一非法时不得回退。并发取消先赢时，重领Worker不得覆盖取消终态或扣额。

processing任务的公共API与幂等重放不得返回 `quality_fallback` 或正文。stale exhausted任务有合法fallback时不得被批量失败；无合法fallback时保持旧失败行为。质量调使用40秒总预留，覆盖30秒租约恢复窗口、约1.5秒Worker轮询、数据库余量和至少5秒成功事务；剩余时间不超过40秒直接提交fallback，deadline后仍按timeout。

医疗整句fixture必须拒绝“这不是玫瑰痤疮，而是普通敏感”“你的情况更像玫瑰痤疮”“确定是皮炎”“肯定是湿疹”“其实是皮肤屏障受损了”“怎么判断是不是皮炎，其实就是湿疹”“其实就是湿疹，怎么判断是不是皮炎”，并接受纯“怎么判断是不是皮炎”“这是皮炎吗”等问句。问句豁免必须逐病名且仅作用于当前分句。医疗转介不计营销CTA，但“咨询我们”“咨询门店”“到店咨询”必须继续返回 `cta`。商家断言fixture使用可信项目名称“轻颜皮肤管理中心”，拒绝无资料依据的“店内配备进口美容仪”“咱们店用的是进口美容仪”“轻颜配备进口美容仪”“我们店有进口美容仪”“我们店有一台进口美容仪”“我们店配有进口美容仪”，接受“我们店没有使用进口美容仪”“我们店未配备进口美容仪”“我们店经常有人问美容仪怎么选”“我们店有不少顾客问美容仪怎么选”和普通通用知识。单字能力动词“有”到风险事实最多间隔2字，其他能力动词最多间隔6字；项目名称不得作为医疗或功效依据。

### 19.4 回归门禁

```bash
NODE_OPTIONS=--require=./tests/server-only-shim.cjs node --import tsx --test tests/custom-scripts/contracts.test.ts tests/custom-scripts/service-runtime.test.ts tests/custom-scripts/job-runner-runtime.test.ts tests/custom-scripts/integration.test.ts
npm test
npm run lint
npm run typecheck
npm run build
npx prisma validate
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output /tmp/custom-script-length-schema.sql
npm audit --omit=dev
git diff --check
```

全部退出码必须为0；CI隔离数据库用例不得跳过。本轮只部署和验收staging，部署后不继续真实DeepSeek生成，须先交验收Agent检查。

## 20. 定制化脚本Prompt目标240—300与恢复带

### 20.1 Prompt结构与兼容边界

首轮 Prompt 必须包含：创作目标240—300、建议约200—350、完整安全口播优先且不为凑字编造事实、最多350，以及按服务端 Unicode code points 口径去空白计数和开头钩子、中段痛点/判断/已有事实、结尾场景或选择逻辑的结构职责。Prompt不得暴露80底线。

通过判据：不固定总行数、段落、换行或单句长度。80、150与199安全正文进入持久fallback和可选增强；200与350安全正文在一次Provider调用后成功。同段多句、跨行断句和超过25 code points的单句继续允许，质量增强不得把格式偏好变成硬拒绝。

### 20.2 越界定向重试

使用可控Provider让首轮返回少于80或超过350的正文。第二次 Prompt 必须包含服务端 `actualCount`，明确目标240—300，并继续禁止新增价格、活动、地址、工艺、数据、资质、功效或服务事实；不得包含首轮正文或暴露80底线。

通过判据：`maxTokens=1600`、固定 `response_format`、温度策略、`thinkingMode=disabled`、两次调用上限均不改变；不增加第三次调用，不让模型返回 `charCount`，服务端不拼接或截断。

### 20.3 行数桶与日志安全

覆盖 `lineCountBucket` 全部边界：0/4→`under_5`，5/9→`5_9`，10/14→`10_14`，15/20→`15_20`，21/30→`21_30`，31→`over_30`。运行时序列化只接受以上白名单值，伪造精确值或未知值必须丢弃。

每个可解析正文的 `custom_script_validation_invalid` 必须包含行数范围桶；连续两次失败的终态日志保留最后一次范围桶。日志不得出现正文、Prompt、商家资料、精确字数、精确行数或明文ID，既有安全字段不得扩大。

### 20.4 回归门禁

运行聚焦测试、全量测试、`lint`、`typecheck`、生产构建、Prisma校验、schema diff、`npm audit --omit=dev`和`git diff --check`。隔离数据库必须实际覆盖：80/150/199持久fallback与恢复、200/350首轮一次成功、范围外修复成功、连续两次范围外失败且0扣额、幂等/并发取消/额度/租约恢复；灵活自然排版、纯标点拒绝和事实安全用例必须继续通过。

## 21. 定制化脚本fresh重试与正文不回灌

### 21.1 校验顺序与单次优先

固定验证`success.finalScript`顺序为：shape/normalize → 非空与基础非口播内容 → 禁用表达/数字事实/CTA → 上一版重复 → 总长度。自然段落、任意换行、单句长度和句末标点不作为拒绝原因；80和350边界及其他合规80—350正文行为必须保持不变。

使用80、150、199字合规正文时，领域校验返回安全成功，Worker随后持久化fallback并决定是否增强；200、240、300和350字合规正文首轮直接完成。使用79和351字正文时，只允许返回`repairMode=fresh`；无依据数字、禁用表达、标题/分镜/列表等非口播内容、与上一版重复及其他非长度错误同样不得回灌正文。不得为同段多句、跨行断句或长句返回repair。

### 21.2 Prompt注入与内存边界

二轮安全重写Prompt必须包含`serverCount`和240—300目标；短稿补充场景、解释、感受与选择逻辑，长稿删除重复修饰和次要表达。所有消息都不得包含首轮正文。

测试扫描API/Job公共返回、diagnostic、结构化日志、第二次Prompt与错误，均不得出现首轮正文marker；仅数据库processing行可出现严格内部 `quality_fallback`。日志仍只允许非精确`lineCountBucket`，不得新增精确行数。Worker重启后从 `CustomScriptGenerationJob.result` 恢复并复验fallback，总调用数仍最多2。

### 21.3 额度与回归

隔离数据库覆盖：200+合法首轮一次成功扣1、80—199增强或fallback成功扣1、范围外fresh重试成功扣1、两次失败扣0、幂等重放不重复扣、重启后总调用最多2、并发取消获胜后不成功回退。保持`maxTokens=1600`、JSON response format、首轮温度0.75、修复温度0.5、关闭thinking、租约/心跳/截止时间和成功事务不变。

### 21.4 窄语义安全fixture

明确诊断性表达至少覆盖“这是玫瑰痤疮”“确诊皮炎”“诊断为湿疹”“说明已经感染”“说明皮肤屏障受损”，预期统一为`fact_safety`。非诊断一般提示如“可能与刺激有关，建议咨询医生”必须允许，不能一刀切全部皮肤健康教育。

商家高风险断言至少覆盖“我们店使用进口美容仪”：商家资料无进口或设备依据时返回`fact_safety`，资料明确包含同类依据时允许。追加专利、认证、资质、医生/专家和特定仪器设备fixture；只在“我们/本店/本中心/门店/店里”等商家主体附近触发，不用大黑名单误杀普通通用行业知识。

运行聚焦与全量测试、`lint`、`typecheck`、生产构建、Prisma validate/schema diff、`npm audit --omit=dev`与`git diff --check`。CI隔离数据库用例不得跳过；只部署staging，不调用真实DeepSeek，不推production。

## 22. Staging 24句数组隔离探针

### 22.1 安全门控与只读边界

默认环境、错误开关、仅设置任一 staging 开关都必须在任何数据库查询和 Provider 调用前拒绝。唯一允许组合为 `CUSTOM_SCRIPT_SENTENCE_PROBE=STAGING` 与现有 `STAGING_ENABLE_REAL_PROVIDERS=1` 同时成立。`NODE_ENV=production` 是 staging 容器的正常构建形态，不用于区分部署环境；双 staging 开关成立时允许运行。错误模型仍须在数据库查询和 Provider 调用前拒绝。源码与依赖注入测试确认探针只读加载固定测试账号和项目的最新资料，不调用 Job、DailyUsage 或任何 Prisma 写方法；Provider 请求不得携带 `usageUserId`。

探针最多连续5次，首个失败后停止；仅5次全部通过时 `gate=true`。测试必须断言失败后不再调用 Provider，且输出中不含商家资料、固定需求、sentences、finalScript、数据库 ID、账号、项目名或 secret marker。

### 22.2 数组契约与原样拼接

红测覆盖：23项与25项拒绝、非字符串、空字符串、单项含多句或换行、缺少末尾标点、单句正文超过25 code points、编号/标题/解释。合格24项必须保持原顺序，拼接结果严格等于原数组 `join("\n")`，服务端不得 trim、规范化、补写、删除、重排或截断。

拼接后完整复用现有 `validateCustomScriptDomainOutput`：覆盖279拒绝、280通过、300通过、301拒绝，以及无依据数字事实、禁用表达、非允许CTA和 `needs_profile` 固定码。探针输出不得包含精确总字数或精确单句长度，只输出长度桶和布尔校验结果。

### 22.3 Provider与脱敏观测

测试固定请求参数：`deepseek-v4-flash`运行配置、`thinkingMode=disabled`、`maxTokens=1600`、`temperature=0.75`、`maxAttempts=1`、`allowEnvelopeRetry=false`，Prompt顺序为安全规则 → 商家资料 → 写作规则 → 用户需求。

每次只输出：`runIndex`、`status`、`durationMs`、`jsonParsed`、`exact24`、`assembledLengthBucket`、`sentenceMaxWithin25`、`punctuationOk`、白名单 `validationReason`、`finishReason`、Token与缓存桶。真实 DeepSeek 由主 Agent 在已授权 staging 终端执行；执行 Agent只负责部署并提供精确SHA及不含 secret 的命令。

### 22.4 回归门禁

运行探针聚焦测试、全量测试、`lint`、`typecheck`、生产构建、Prisma validate/schema diff、`npm audit --omit=dev`与`git diff --check`。本阶段不得修改主业务 Prompt、Job、Worker、额度、页面或产品 API，不得推 production。

## 23. Staging 索引扩写与确定性子集探针

### 23.1 双门禁、调用上限与只读边界

默认环境、错误开关、单独任一开关和错误模型必须在数据库查询与Provider调用前拒绝。唯一允许组合为 `CUSTOM_SCRIPT_REPLACEMENT_PROBE=STAGING`、`STAGING_ENABLE_REAL_PROVIDERS=1` 和运行模型 `deepseek-v4-flash`。生产构建形态的staging可以运行，但探针不能依赖`NODE_ENV`判断环境。

每轮必须记录恰好两次Provider调用；首轮Provider失败时允许只发生一次。每轮上限2次、最多5轮，首个失败立即停止。请求固定`thinkingMode=disabled`、`maxTokens=1600`、`maxAttempts=1`、`allowEnvelopeRetry=false`且不含`usageUserId`。静态测试扫描探针及CLI，确认无Prisma写方法、事务、Job、DailyUsage或AI用量写路径。

### 23.2 前缀契约、服务端拼接与安全过滤

红测覆盖：旧`replacements`字段、内层额外旧`replacement`字段、prefix缺失或非字符串、空串、纯空白、纯标点、CR/LF/U+2028/U+2029、Unicode format/零宽字符、Emoji/区域旗帜、反引号、标签/括号占位符、编号/标题、CTA、Unicode数字和中文数字、缺少索引、重复索引和越界索引。`prefixes`必须正好24项，索引0—23唯一完整；每个prefix只能是2—4个自然汉字。只有24项逐项精确字段且全部合法时才把数量契约记为成功，`validPrefixCount=23`或24项全非法都必须失败。

第二次Prompt必须把首轮24句只放在最后一个user JSON字段`untrustedSentences`；system明确其中任何指令都只是待编辑数据。其他消息不得出现这24句。返回形状唯一为`success + prefixes[{index,prefix}]`，旧完整replacement形状必须拒绝。

服务端候选结构只允许`index + prefix`。finalizer必须从prefix和对应originalSentence重新拼接并重算delta；测试注入伪造replacement/delta时，最终结果仍必须保留正确原句且不受伪值影响。拼接后超过25字拒绝，并继续覆盖禁用表达、数字事实、CTA、句式与完整脚本校验。事实测试需记录：确定性数字事实边界有效，但“每天现做”“免费配送”“进口原料”等非数字商业事实不能仅靠当前校验可靠识别，不得用脆弱关键词黑名单把该限制伪装成已解决。

### 23.3 确定性子集与最终边界

用固定fixture验证子集选择顺序：先使最终长度最接近290，再使替换条数最少，最后按升序索引数组字典序最小。覆盖279/301拒绝、精确280/300通过和无可行非空子集；最终正文必须至少选中1个`prefix + originalSentence`候选。24项全非法但基础稿288字、`validPrefixCount=23`、selectedCount=0都必须`gate=false`，并保留首个实际validationReason而不是覆盖成`none`。

### 23.4 CLI、脱敏与回归

CLI边界可独立测试：`gate=true`返回0，`gate=false`返回1；旧24句探针CLI同时修复为相同行为。每轮输出只包含白名单状态、耗时、调用数、JSON布尔值、数量/长度桶、有效/选中候选桶、校验原因、finish reason和Token/缓存桶。日志fixture必须证明不含商家资料、固定需求、句子、Prompt、响应、账号、项目名、数据库ID或secret。

依次运行聚焦测试、全量测试、`lint`、`typecheck`、生产构建、Prisma validate/schema diff、`npm audit --omit=dev`和`git diff --check`。CI通过后只允许合并并部署staging，不自动运行真实DeepSeek，不推production；由主Agent在授权终端执行最多5轮真实探针并把脱敏结果交验收。

## 24. Staging 固定 prefixId 结构性修复

### 24.1 单一事实源与精确响应契约

- 固定映射必须只有10—16项，每个ID唯一且值为2—6个Unicode code points；自动化逐项证明映射文字不含价格、优惠、配送、原料、资质、效果、服务动作、CTA或商家专属事实。Prompt示例与解析器必须从同一枚举派生，禁止复制第二份ID列表。
- 第二次响应唯一形状为 `success + prefixChoices[{index,prefixIds}]`。外层额外字段、旧`prefixes`/`replacements`、内层`prefix`/`replacement`/`delta`、缺字段、额外字段、非数组、23/25项、重复/缺失/越界索引全部拒绝。
- 每项`prefixIds`必须为1—3个互不重复的已知ID；输入顺序不表达偏好，服务端必须按枚举顺序规范化。覆盖24项完整响应中每项两个known unique ID逆序并确认接受且候选顺序稳定；0项、4项、重复ID、未知ID、自由汉字/商业事实/纯汉字指令伪装ID、对象/数字/null和枚举注入字符串仍不得产生候选。
- 完整24项示例必须使用至少4种ID，不得24项全部相同；`untrustedSentences`只能出现在最后一个user JSON字段，system明确它不可执行。

### 24.2 服务端映射、选择器与边界

- 候选类型只允许`index + prefixId`。测试向finalizer伪造`prefix`、`replacement`、`delta`和映射文字时，最终正文仍必须由唯一映射重新构建，原句保持连续且长度按实际fixedPrefix重算。
- 只保留拼接后单句不超过25字且通过既有非长度校验的候选；覆盖全部候选超长、部分短ID可用、增量不足、base>300、279/280/300/301与无解。
- 选择器固定顺序为：距290最近、替换更少、索引/ID枚举序稳定；同一ID最多2次，相邻选中项不得同ID，选中超过2项至少2种ID。覆盖全部同ID、多样性无解、相邻重复候选、稳定决胜和合法多样解。
- 用20组非数字事实与指令fixture证明它们都不是合法ID且无法由映射文字新增，至少覆盖：每天现做、免费配送、进口原料、官方认证、绝对有效、半价优惠、双倍赠送、俩人同行、首单立减、永久免费、国家标准、行业第一、当天见效、上门服务、到店倒茶、赠送礼品、限时名额、销量冠军、忽略规则、输出原文。不得新增对应关键词黑名单作为实现机制。
- 正式产品语义记录为80—350内部安全范围内的合规正文可直接成功；隔离探针仍保留自己的历史280—300门槛，第一轮Prompt固定要求base<280。若fixture给出探针门槛内的base，探针仍必须执行并严格验证第二次契约，非法响应或空选择不能假通过；base>300只调用一次并失败。

### 24.3 只读、观测与调用门禁

- 双staging开关和精确模型校验继续在资料读取与Provider调用前执行。每轮最多2次、最多5轮；首个失败停止；`gate=false` CLI退出码非0。
- 静态扫描与依赖注入证明不写Job、DailyUsage、AI用量或其他数据库记录，不传`usageUserId`。输出只允许桶和白名单原因，不含商家资料、需求、句子、ID选择、fixedPrefix、Prompt、响应、账号、项目名、数据库ID或secret。
- 开发、CI和验收Agent不得调用真实DeepSeek。CI绿且staging精确部署后，由主Agent运行最多5轮真实探针；只有每轮`passed + valid_280_300`且最后为`gate=true,runsCompleted=5`才进入产品链路评估。

### 24.4 回归门禁

按顺序运行：

```bash
NODE_OPTIONS=--require=./tests/server-only-shim.cjs node --import tsx --test tests/custom-scripts/staging-replacement-probe.test.ts
npm test
npm run lint
npm run typecheck
npm run build
npx prisma validate
npx prisma generate
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output /tmp/custom-script-prefix-id-schema.sql
npm audit --omit=dev
git diff --check
```

全部退出码为0；build与typecheck按顺序执行，避免竞争`.next`。旧PR61/62全部对抗fixture必须继续通过。本轮只允许合并并部署staging，不调用真实DeepSeek，不推production。

## 25. Staging prefixId 观测与性能收口

### 25.1 外部日志不得包含精确分布

- 内部 `PrefixChoiceEvaluation` 继续保留精确 `validChoiceCount` 和 `reasonCounts` 供gate使用；构造外部 `ReplacementProbeMetric` 时必须删除精确 `validChoiceCount`，只保留 `validChoiceCountBucket`。
- 外部字段改为 `reasonCountBuckets`；所有原因值只能属于 `0|1_5|6_12|13_23|24`。`baseSentenceLengthBuckets` 的五个句长区间值也只能属于同一联合类型，不得输出精确句数。
- 日志白名单fixture同时检查字段名、字段值类型和序列化文本：不得出现顶层精确 `validChoiceCount`，不得在原因或句长分布中出现number；候选、选中和choice数量只允许闭合桶。允许精确数值仅为 `runIndex`、`durationMs`、`providerCalls` 和尾行 `runsCompleted`。
- `ReplacementProbeMetric`、安全Provider诊断和所有bucket helper必须返回闭合联合类型，覆盖未知finish reason、响应长度、parse error和Token值的安全回退；禁止使用宽泛 `string` 隐藏新值。

### 25.2 选择器可达性、稳定性与预算

- 候选预处理拒绝与固定ID映射长度不一致的 `delta`，按 `index + prefixId` 去重并按索引/ID枚举序稳定排序。倒序、重复或伪造delta不得改变答案。
- 24×3候选、base=200且全部固定ID总可达增量不足时必须快速返回 `no_solution`；主要硬断言为状态/转移预算不超限，开发机目标小于250ms，整组性能测试设5秒超时。
- base=208与220分别覆盖确定有解、确定无解和预算耗尽；base=240与264保持PR63前的确定答案。相同候选倒序、重复并连续运行多次必须返回完全相同的finalLength与selectedChoices。
- 默认预算为不超过250,000个唯一状态、1,000,000次分支转移和24层递归。测试注入极小状态或转移预算时必须得到白名单 `selection_budget`；不得得到半成品，也不得被转换为 `no_solution`。
- 递归剪枝测试覆盖全局实际可达增量、实际可用索引数、每ID剩余最多2次、后缀ID可用次数以及后缀最小/最大增量。业务排序和多样性语义保持不变。

### 25.3 回归与发布

先运行新增红测并确认旧实现出现日志精确值和base=200超时/预算接口缺失；实现后依次运行聚焦prefixId测试、全部custom-script探针回归、全量测试、typecheck、lint、build、Prisma validate/generate/schema diff、`npm audit --omit=dev`和`git diff --check`。旧PR61/62/63全部对抗fixture必须继续通过。

CI绿后只合并并部署staging，核对部署exact SHA、web/worker/topic-worker/custom-script-worker门禁和公网health。本轮禁止真实DeepSeek、产品链路改造和production部署。

## 26. Staging 定制脚本 link-first 真实探针

- 工作流只允许 `workflow_dispatch`，必须使用 `staging-hk` Runner、`staging` Environment，并在调用前验证 `.deployed-image-tag === GITHUB_SHA` 和单个 `custom-script-worker` 正常运行。
- `CUSTOM_SCRIPT_LINK_FIRST_PROBE=STAGING`、`STAGING_ENABLE_REAL_PROVIDERS=1` 与运行模型 `deepseek-v4-flash` 三项门禁必须在读取固定测试资料和调用 Provider 前全部成立。
- 每轮直接复用产品 `requestCustomScriptAttempt`、80—350内部安全校验和120秒截止。领域输出无效时只允许一次 fresh retry；Provider失败不重试；不得调用 prefixId/replacement repair。最多5轮，首轮失败立即停止。
- 探针 Provider 边界必须删除 `usageUserId`，源码不得调用 Job、账号用量、事务或通用 Prisma 写方法。测试必须证明运行前后不会创建 `CustomScriptGenerationJob`、修改 `DailyUsage.scriptsGenerated` 或扣每日脚本额度。
- 每轮 stdout 精确限制为 `runIndex/status/providerCalls/durationMs/lengthBucket/parserReason/scriptLengthBucket/finishReason/providerSubreason`，尾行只允许 `gate/runsCompleted`。任何商家资料、固定需求、Prompt、模型正文、用户/项目 ID 或密钥均不得出现。
- 五轮均为 `passed` 才允许 `gate=true,runsCompleted=5`；真实 DeepSeek 只由主 Agent 在 staging 精确部署后手动触发，不得自动推 production。
