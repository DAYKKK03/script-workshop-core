> 以下为来源项目的历史记录，不代表基础版当前部署或验收状态。当前交付范围见 README.md；本次拆分验证见 docs/CORE_EDITION_VERIFICATION.md。

# EXECUTION_STATUS.md

缺陷统一记录见 `docs/BUG_LOG.md`。

## 当前 PRD 版本

PRD v1。

## 当前执行策略

第一版严格按 MVP 执行，不扩展功能。

核心变化：

1. 注册方式改为账号 + 密码 + 邀请码。
2. 商家资料只用大文本框，不做复杂字段结构化表单。
3. 第一版只支持抖音链接自动提取。
4. 不支持小红书、视频号。
5. 不支持手动粘贴口播文案兜底。
6. 不支持上传视频或音频兜底。
7. 不做历史记录。
8. 不做站内编辑。
9. 抖音口播提取必须通过安全、合规的能力。
10. 生成内容必须基于所选商家项目最新资料。

## 状态标记说明

- TODO：未开始
- IN_PROGRESS：开发中
- DONE：已完成
- DONE_WITH_RISK：核心路径已完成，但仍有明确剩余风险
- BLOCKED：被外部能力或决策阻塞
- REMOVED：本版明确不做

## P0 功能状态

| 模块 | 状态 | 说明 |
|---|---|---|
| 项目骨架 | DONE | Next.js / TypeScript / Tailwind 骨架已完成并验收 |
| 数据库与 Prisma | DONE | 已统一 PostgreSQL，包含全新初始 migration、无默认测试邀请码的受控 seed 和 Prisma Client |
| 注册页 | DONE | 接入真实注册 API，账号、密码、邀请码 |
| 登录页 | DONE | 接入真实登录 API，账号、密码 |
| 邀请码机制 | DONE | unused / used / disabled 校验，注册事务内消费邀请码 |
| 工作台首页 | DONE | 登录后进入，未登录跳转登录页 |
| 商家项目列表 | DONE | 只展示当前登录用户自己的项目 |
| 商家项目新建 | DONE | projectName + profileText |
| 商家项目编辑 | DONE | 大文本框更新资料 |
| 商家项目权限隔离 | DONE | Project API 和页面均按当前用户隔离 |
| 抖音链接输入 | DONE | 生成页骨架已提供抖音链接输入，真实校验后续实现 |
| 抖音口播提取 Provider | BLOCKED | Provider 接口和 API 已封装；当前无安全合规提取能力，按规范返回失败 |
| 抖音口播提取合规调研 | DONE_WITH_RISK | 本轮公开资料未发现可立即接入的官方任意链接口播/字幕/音频提取接口；火山 ASR 只能作为授权媒体 URL 到文本的下游能力 |
| Provider 抽象与 ASR/TikHub 插槽 | DONE_WITH_RISK | `DOUYIN_PROVIDER` 支持 blocked/asr/tikhub；默认 blocked；ASR 需要授权媒体 URL 和服务端 Key；TikHub 仅为默认关闭的测试插槽 |
| TikHub 测试模式返回结构验证 | DONE_WITH_RISK | 已增加 TikHub 测试模式结构摘要；当前本地 TikHub Key/Base URL/Test URL 未配置，真实外部调用未执行，结构状态为 not_configured |
| TikHub 真实测试调用 | DONE_WITH_RISK | 本地 TikHub 测试配置存在并已真实调用；GET + 固定路径 + share_url 查询参数可用；Bearer 认证返回 200；最新返回 transcript，未返回 media URL |
| TikHub 多链接稳定性测试 | DONE_WITH_RISK | 用户补充 5 条真实分享链接后已测试；transcript 4、media_url 0、unknown 1、provider_error 0、DeepSeek 可拆解 4；建议进入 P1-9 页面真实流程接入测试 |
| 页面真实流程接入测试 | DONE_WITH_RISK | Retry 已通过真实 HTTP/session 流程验证注册登录、项目创建、/generate 访问、成功链接提取/拆解/生成、unknown 固定失败、未登录拦截和项目隔离；可视化补验已确认页面注册、创建项目、生成结果、复制按钮实际点击和固定失败提示 |
| TikHub media URL 映射与 ASR POC | DONE_WITH_RISK | 已支持 TikHub 嵌套视频 URL 路径；单链接摘要同时命中 transcript 与 media URL；当前本地火山/豆包 ASR 配置缺失，ASR 转写未执行 |
| 火山/豆包 ASR Provider POC | DONE_WITH_RISK | 火山 submit/query 已真实跑通并返回 transcript；DeepSeek 拆解/生成摘要通过 |
| 页面级 ASR 真实流程回归 | DONE_WITH_RISK | 真实 session/API 流程已验证 `/generate` 登录态页面、TikHub media URL、火山 ASR、DeepSeek 拆解/生成；浏览器快照/点击工具不可用，复制按钮沿用 P1-9 可视化补验和源码断言 |
| 上线前稳定性与生产配置收口 | DONE_WITH_RISK | 已补齐生产 env 清单、部署 checklist、TikHub/ASR 超时边界和前端防重复提交；不包含商业级限流/监控 |
| 无域名公网 IP 临时 Staging 部署 | DONE_WITH_RISK | 已增加显式 `deploy_mode=ip-http`、独立 Compose/Caddy、服务器侧二次保护和环境变量 fail-fast 校验；当前要求服务器 `.env.production` 在该模式下显式设置 `SESSION_COOKIE_SECURE=false`，正式模式保持 `true`；真实 Provider 默认关闭，只有 `STAGING_ALLOW_IP_HTTP=1` 与 `STAGING_ENABLE_REAL_PROVIDERS=1` 同时满足时才允许 `DOUYIN_PROVIDER=tikhub`；该模式仅用于可信测试，不是正式生产方案 |
| P1-20 安全收口与 staging 可信基线恢复 | DONE_WITH_RISK | 仓库内不再保留临时 `bootstrap-admin` HTTP 路由；本地部署文档与工作日志已脱敏为占位符；新增安全回归测试防止接口或真实凭据回归。剩余风险转为“服务器与供应商侧旧密钥必须轮换”，详见 `docs/BUG_LOG.md` 与 `docs/superpowers/plans/2026-07-06-p1-20-security-closure.md` |
| P1-21.2B / P1-21.2C / P1-21.2D / P1-21.2E / P1-21.2F 抽取失败脱敏观测与 TikHub 请求诊断 | IN_PROGRESS | 同一样本已确认 create job 成功、worker claim 成功，当前阻断收敛到 TikHub 请求层 `404 / TIKHUB_PROVIDER_REQUEST_FAILED`；正在核对官方契约并修复可能遗留的 `TIKHUB_API_BASE_URL` 旧域名与重试策略，不改变用户可见错误文案 |
| 部署演练与浏览器完整回归 | BLOCKED | 生产模式可启动且基础页面/权限通过；完整同步 ASR 提取在生产 API 路径约 90-114 秒后仍可能固定失败，真实浏览器点击工具不可用 |
| ASR 异步任务与页面轮询 | DONE_WITH_RISK | 已把长同步提取拆为 ExtractionJob 运行态任务、创建/查询 API 和页面轮询；返修后完整链接终态清空，transcript 首次读取后清空，过期任务机会式删除 |
| 部署平台与生产数据库/任务队列方案 | DONE_WITH_RISK | 已决策最快 MVP 路径为单长运行服务器 + PostgreSQL + DB polling worker；稳定路径为托管 web/worker + managed PostgreSQL + 队列/worker；当前未执行迁移 |
| 提取失败提示 | DONE | 生成页调用提取 API 后展示固定失败文案 |
| 参考脚本拆解 | DONE | analyzeReferenceScript 已接入 DeepSeek service；未配置 DEEPSEEK_API_KEY 时明确返回 BLOCKED |
| 新脚本结构生成 | REMOVED | 产品流程调整：不再单独输出商家版新脚本结构 |
| 时长选择 | DONE | 15-30 / 30-60 / 60-90 |
| 完整脚本生成 | DONE | generateFinalScript 已接入 DeepSeek service；继续读取所选项目最新资料；未配置 DEEPSEEK_API_KEY 时明确返回 BLOCKED |
| DeepSeek 真实联调 | DONE_WITH_RISK | 本地服务端 Key 已配置；真实拆解、15-30 和 30-60 生成已跑通；60-90 质量调优后短参考结构和多段参考结构真实生成均通过 |
| DeepSeek Key 安全配置 | DONE | Key 只允许服务端环境变量或部署 Secret；禁止 NEXT_PUBLIC_DEEPSEEK 和前端暴露 |
| AI 输出质量控制 | DONE | DeepSeek 非 JSON/空输出最多轻量重试一次；最终脚本校验长度、拒绝整段复制参考原文，并对质量不合格最多重试一次 |
| 复制按钮 | DONE | finalScript 生成后显示一键复制，复制成功/失败有反馈 |
| 历史记录 | REMOVED | 第一版不做 |
| 站内编辑 | REMOVED | 第一版不做 |
| 手动粘贴兜底 | REMOVED | 第一版不做 |
| 小红书支持 | REMOVED | 第一版不做 |
| 视频号支持 | REMOVED | 第一版不做 |

## V2 爆款选题状态

| 模块 | 状态 | 说明 |
|---|---|---|
| 产品与视觉方案 | DONE | 已确认“商家最新资料 → 识别赛道 → 5个关键词 × 5个消费对象/场景 → 25个选题 → Top 3优先拍”；Top 3固定覆盖引流、信任、转化。事实来源：`docs/TOPIC_IDEAS_DESIGN_SPEC.md` |
| 产品/API/AI/数据库/测试文档 | DONE | 已同步固定10种爆款元素及安全改写、删除脚本类型、每日额度、Top 3和两段API契约 |
| 功能实现 | DONE_WITH_RISK | `/topics`、AI Service、25宫格、Top 3、额度及独立异步 Topic Worker 已实现；POST快速入队、前端轮询、请求幂等、锁续租、原子扣额度和短期结果清理已补齐。全量测试、typecheck、lint、build与Prisma校验通过 |
| 上线 | BLOCKED | 首次staging真实生成暴露15秒网关超时，现已完成异步返修但尚未重新部署验收。必须复测migration、真实DeepSeek完整结果、Topic Worker、权限/额度与桌面/移动视觉；通过前不得推生产 |

## 主要风险

### 风险 1：抖音口播提取能力

第一版要求自动提取抖音口播，但不能使用不稳定或违规硬抓取方式。

处理方式：将抖音提取封装为 douyinTranscriptProvider；如果没有安全合规 provider，功能状态保持 BLOCKED；不允许用手动粘贴兜底绕过 PRD；不允许把 mock 伪装成真实提取。P1-4 调研确认当前可接受路径是合规上游 Provider 返回字幕或授权媒体 URL；下游 ASR 只能处理合法媒体到文本，不能解决抖音链接到音频/字幕的获取。

候选 Provider 接入条件：

1. 提供正式接口文档和稳定 SLA。
2. 明确商用条款、授权来源、平台合规边界。
3. 明确返回内容是字幕文本、授权媒体 URL 还是两者都有。
4. 不要求使用用户 Cookie、模拟登录、绕过风控、非公开接口或无水印下载。
5. 失败时可映射为统一固定提示，不向用户暴露第三方内部错误。

P1-5 Provider 配置：

- `DOUYIN_PROVIDER=blocked`：默认安全失败态，不生成假 transcript。
- `ip-http` staging 启用真实 Provider 时，必须显式设置 `STAGING_ENABLE_REAL_PROVIDERS=1`，并补齐 TikHub / 火山 ASR / DeepSeek 变量；否则部署前校验会强制回到 `blocked`。
- `DOUYIN_PROVIDER=asr`：服务端必须同时配置 `ASR_AUTHORIZED_MEDIA_URL`、`ASR_API_BASE_URL`、`ASR_API_KEY`；ASR 只处理合法授权媒体 URL，不解析抖音链接。`ASR_AUTHORIZED_MEDIA_URL` 仅用于本地/内部测试，生产必须由上游 Provider 基于当前抖音链接返回对应授权媒体 URL。
- `DOUYIN_PROVIDER=tikhub`：默认关闭；只有显式启用并配置 `TIKHUB_API_KEY`、`TIKHUB_API_BASE_URL` 才会尝试。当前仅为测试模式 Provider 插槽，不能写成已合规生产 Provider。
- 当前本地未配置 ASR/TikHub Key，因此真实 ASR/TikHub 调用保持 blocked；DeepSeek 已有拆解/生成服务不受影响。
- ASR/TikHub 响应解析已收紧：只接受明确字段名命中的 transcript/media URL；transcript 必须达到最小有效长度；media URL 必须是 http/https。普通 `message`、`requestId` 不会被当作成功结果。
- P1-6 TikHub 测试模式只输出结构摘要，不输出 Key、完整响应或敏感 URL。当前环境缺少 TikHub Key/Base URL/Test URL，真实调用 blocked by missing configuration；默认 provider 仍为 blocked。
- P1-7 本地 TikHub 测试配置已存在；TikHub 请求已改为 GET，路径摘要 `/api/v1/douyin/web/fetch_one_video_by_share_url`，通过 `share_url` 查询参数传入链接。认证方式摘要显示 `Authorization: Bearer` 返回 200，直接 `Authorization` 和 `X-API-Key` 返回 401。最新真实调用结果为 `transcript`，未命中 media URL，因此不需要 ASR；提取 API、DeepSeek 拆解和最终生成已做摘要验证。`desc` 不作为 transcript 字段，避免视频描述伪装成口播文本。
- P1-8 多链接稳定性测试已使用 5 条真实分享链接补充验证，结果为 transcript 成功 4 条、unknown 1 条、media_url 0、provider_error 0，DeepSeek 可拆解 4 条；抽样拆解 2 条摘要均通过。建议进入 P1-9 页面真实流程接入测试，同时保留 unknown 结构的固定失败处理。
- P1-9 Retry 已用真实 HTTP/session 流程补齐页面依赖链路：临时用户注册登录、临时项目创建、`/generate` 访问、成功链接提取/拆解/生成、unknown 固定失败、未登录拦截和跨用户项目隔离均通过；临时数据已清理。本轮同时修复提取 API 错误码暴露风险，Provider 内部失败对外统一为 `DOUYIN_TRANSCRIPT_UNAVAILABLE`。后续可视化补验已通过浏览器完成页面注册、项目创建、生成结果展示、复制按钮实际点击和固定失败提示检查。
- P1-10 Fix 已补充 TikHub 显式嵌套 media URL 解析，覆盖 `aweme_detail.video.play_addr.url_list`、`download_addr.url_list`、`play_addr_h264.url_list` 和明确音乐播放 URL 路径；`desc`、`title` 等描述性字段仍不作为 transcript。用户单链接摘要同时命中 transcript 与 media URL，主链路优先 transcript；当前本地 ASR 服务端变量缺失，媒体转写状态为 `ASR_NOT_CONFIGURED`。
- P1-11 Real Submit 已完成：TikHub media URL 命中，火山 submit 真实调用返回 HTTP 成功，状态头显示受理成功并返回 request id 摘要；响应未直接包含 transcript，也没有可用正文转写结果。Provider 已修复为识别受理态 `submitted`，不会把 submit 受理伪装成转写完成。下一步需要查询/轮询接口获得 transcript。
- P1-12 Fix 已按官方文档修正 query：body 固定 `{}`，header 使用 `X-Api-Key`、`X-Api-Resource-Id`、`X-Api-Request-Id`，query 阶段不发送 `X-Api-Sequence`；`20000001/20000002` 继续轮询。真实链路中 TikHub media URL 命中，火山 submit/query 返回 transcript，长度摘要 1058；DeepSeek 拆解成功 9 段，最终生成成功，长度摘要 116。
- P1-13 页面级真实流程回归已完成真实 session/API 验证：临时用户注册、临时项目创建、登录态访问 `/generate`、提取 API 触发 TikHub media URL 与火山 ASR、DeepSeek 拆解 6 段、最终生成长度摘要 232 且命中项目资料；无效链接固定失败，未登录拦截和跨用户项目隔离通过，临时数据已清理。本轮修复短 transcript + media URL 时优先 ASR、提取 API 不再向前端返回 `source/audioUrl`、ASR 默认轮询覆盖约 45 秒。
- P1-14 已完成上线前收口：`.env.example` 补齐生产变量和超时变量；新增部署 checklist；TikHub 请求默认 15 秒超时；火山 ASR submit/query 单次请求默认 30 秒超时；页面提取/生成 handler 增加处理中 guard；缺配置/失败路径仍不伪造成功、不暴露内部详情。
- P1-15 生产模式演练已确认 `npm run start` 可用，生产模式 `/`、`/login`、`/register` 可访问，未登录 `/generate` 跳转 `/login`。但完整生产 API 链路阻断在抖音提取阶段：TikHub media URL 命中，直接火山 ASR 诊断可成功，但生产 API 同步路径多次在长等待后返回固定失败，未进入 DeepSeek 拆解/生成。真实浏览器点击工具仍不可用，不能声明页面点击流通过。
- P1-16 已实施异步化：新增 `ExtractionJob` 运行态任务表，创建任务后由服务端后台执行 TikHub/ASR 提取，页面通过 job API 轮询状态。该任务记录仅用于运行状态，不提供用户历史入口；成功响应只返回 transcript 给当前流程，不返回 media URL 或第三方原始响应。返修后完整 sourceUrl 只在处理期间临时保留，任务终态后清空并保留 host/hash 摘要；完整 transcript 首次被当前用户读取后清空；过期任务在创建/查询入口机会式删除。当前方案适合本地/单实例演练，多实例或 Serverless 生产仍建议使用持久队列/worker。
- P1-21.2A 只读诊断已确认入口层、登录和 DeepSeek 未阻断；历史失败聚合曾集中在 TikHub 请求阶段。P1-21.2B 再次用单条样本最小复现后，发现新 job 停留在 `queued / attemptCount=0`，worker 进程存在但没有新的提取失败日志，说明当前第一阻断更像 worker claim 层。P1-21.2C 因此改为补 worker claim 级脱敏观测，再用同一条样本确认 claim 子类型。
- P1-17 已完成代码实施：PostgreSQL、独立 worker、数据库会话与限流、管理员 TOTP/RBAC、用量后台、Docker/Caddy、COS 加密备份和 GitHub Actions。云资源开通与 staging 演练仍需外部账号权限。
- P1-18 状态为 `BLOCKED`：已完成 PostgreSQL/Prisma、Worker 并发与重试边界、管理员恢复码与响应缓存、用量计费、Compose/CI/备份脚本的本地收口，并通过自动化测试和生产构建；本机无 Docker 和可连接 PostgreSQL，香港 staging migration、Worker 重启恢复、Caddy、COS 备份恢复及发布回滚尚未真实验证。
- BUG-20260627-004 已修复：TikHub 媒体选择改为优先明确独立音轨，视频回退路径携带 MP4 格式；火山 ASR 失败按提交失败、查询请求失败、查询超时、供应商拒绝和无可用音轨保存安全分类。脱敏真实任务已从旧视频路径持续处理中恢复为音轨路径成功，页面失败提示仍保持固定文案。

### 风险 2：AI 拆解泛泛总结

拆解必须绑定原文片段。

处理方式：AI 输出强制 JSON；每个结构节点必须包含 originalText；后端校验 originalText 是否与原文高度相似；不通过校验则要求重试或返回错误。

### 风险 3：生成内容沿用原商家信息

生成新脚本不能继续使用参考视频原商家信息。

处理方式：generateFinalScript 阶段要求只基于所选项目最新 profileText，并参考 referenceStructure 的顺序和表达功能；如果出现明显沿用，后端要求重试。

### 风险 4：DeepSeek 环境与网络

AI service 已接入 DeepSeek OpenAI-compatible API，默认模型为 `deepseek-v4-flash`。

处理方式：Key 只从服务端 `DEEPSEEK_API_KEY` 读取；本地可放 `.env.local`，线上应放部署平台 Secret；禁止 `NEXT_PUBLIC_DEEPSEEK*` 和前端暴露。未配置 Key 时 API 保持 BLOCKED，不伪装成功；本地已完成真实拆解、15-30 和 30-60 生成联调。

### 风险 5：AI 输出质量波动

DeepSeek 可能返回非 JSON、空输出、长度不符合要求或直接复制参考原文。

处理方式：DeepSeek 非 JSON 或空输出最多轻量重试一次；拆解结果必须能映射回原文且保持顺序；最终脚本目标仍按时长范围生成，服务层允许小幅容差，并拒绝整段复制参考原文。最终脚本触发明显长度不合格或复制参考原文时，最多重新生成一次。60-90 秒已加强 prompt、短参考结构扩写提示和长度下限；短参考结构真实生成长度 343，多段参考结构真实生成长度 451，均命中项目资料。

## 下一步建议

1. 准备香港 staging 的 PostgreSQL、Docker/Compose、EdgeOne、COS 和 GitHub Environment 资源。
2. 在 staging 执行 migration、Web/Worker、并发/重启恢复、备份恢复、回滚和负载验证。
3. 继续保留 unknown/provider_error 的固定失败提示，不展示内部错误。
4. 按 `docs/BUG_LOG.md` 的 P1-20 事件清单轮换数据库密码、Session Secret、管理员 MFA 加密密钥、TikHub、火山 ASR、DeepSeek 和 EdgeOne 回源密钥，再继续任何真实 Provider 或正式部署动作。
