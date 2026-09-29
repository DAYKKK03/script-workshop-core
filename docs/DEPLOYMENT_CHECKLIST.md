# DEPLOYMENT_CHECKLIST.md

## 上线前目标

本清单用于把当前 MVP 从本地联调推进到上线前准备状态。上线前仍应保留 PRD v1 边界：不新增上传、手动粘贴、历史记录、站内编辑、支付、会员或团队功能。

## 构建与数据库

上线前运行：

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

数据库注意：

- 本地与生产均已统一为 PostgreSQL，使用 `compose.yml` 的 PostgreSQL 16。
- 生产数据库必须从 migration 全新初始化，不迁移旧 SQLite 测试数据。
- 首次部署运行 `prisma migrate deploy`；seed 默认不创建任何邀请码。
- 不提交 `.env`、`.env.local`、`*.db`、`prisma/dev.db*`。

## 香港 Staging 自托管 Runner

- Runner 必须在线且同时具有 `self-hosted`、`Linux`、`X64`、`staging-hk` 标签。
- Runner 使用专用非 root 账号；确认其可写 `/opt/douyin-script` 且可以运行 Docker Compose。
- `verify`、`image` 必须保持 `ubuntu-latest`；服务器不得执行 npm 测试、Next.js 构建或 Docker build。
- deploy environment 固定为 `staging`，只允许 `staging` 分支；`main` 不得使用该 Runner 自动部署。
- 不配置 `DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS`、远程主机或远程用户 Secret。
- 确认 workflow job 权限：verify 为 contents read，image 为 contents read/packages write，deploy 为 contents read/packages read。
- 首次部署前确认 `/opt/douyin-script` 已存在或 Runner 账号可创建，服务器 `.env` 与 `.env.production` 已由运维单独配置。
- 如果需要无域名公网 IP 临时 staging，只能通过 `workflow_dispatch` 显式选择 `deploy_mode=ip-http`；同时服务器 `.env` 必须设置 `STAGING_ALLOW_IP_HTTP=1`，`.env.production` 必须显式设置 `SESSION_COOKIE_SECURE=false`。如要在该模式启用真实 Provider，还必须显式设置 `STAGING_ENABLE_REAL_PROVIDERS=1`。
- 发布后确认 GHCR 临时登录已退出，Runner 的长期 Docker 配置没有新增仓库凭据。
- 确认 `.env`、`.env.production`、`.deployed-image-tag`、数据库卷和备份未被同步删除或覆盖。
- 详细流程和白名单见 `docs/SELF_HOSTED_DEPLOYMENT.md`。

P1-17 架构决策：

- 最快 MVP 上线建议使用单 VPS 或单长运行服务器，不建议 pure Serverless 承载完整提取链路。
- 生产数据库建议使用 PostgreSQL；SQLite 只用于本地开发或严格受控的单机内测。
- 生产任务处理建议使用独立 worker。第一阶段可用 DB polling worker；后续再评估 Redis/BullMQ 或平台队列。
- 如果选择 Vercel 作为前端/网页平台，必须外置 PostgreSQL 和 worker/queue，不能依赖 API route 内的 in-process job。
- 详细决策见 `docs/DEPLOYMENT_ARCHITECTURE_DECISION.md`。

## 必填环境变量

基础：

- `DATABASE_URL`
- `SESSION_SECRET`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `APP_ORIGIN`（服务端运行时公开 Origin，用于写请求 Origin/CSRF 校验）
- `SESSION_COOKIE_SECURE`（正式 HTTPS 必须为 `true`；临时 `ip-http` 模式必须为 `false`）
- `STAGING_ALLOW_IP_HTTP`（仅临时公网 IP 模式使用，值为 `1` 时才允许该模式）
- `STAGING_ENABLE_REAL_PROVIDERS`（仅临时公网 IP 模式启用真实 Provider 时使用；默认留空或 `0`）

DeepSeek：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_API_BASE_URL`
- `DEEPSEEK_MODEL`
- `AI_REQUEST_TIMEOUT_MS`

抖音 Provider 开关：

- `DOUYIN_PROVIDER`: `blocked` / `asr` / `tikhub`
- 默认建议：`blocked`
- `ip-http` staging 只有在 `STAGING_ALLOW_IP_HTTP=1` 且 `STAGING_ENABLE_REAL_PROVIDERS=1` 时，才允许设置为 `tikhub`

TikHub 服务端变量：

- `TIKHUB_API_KEY`
- `TIKHUB_API_BASE_URL`
- `TIKHUB_REQUEST_TIMEOUT_MS`

火山 / 豆包 ASR：

- `VOLCENGINE_ASR_API_KEY`
- `VOLCENGINE_ASR_RESOURCE_ID`
- `VOLCENGINE_ASR_SUBMIT_ENDPOINT`
- `VOLCENGINE_ASR_QUERY_ENDPOINT`
- `VOLCENGINE_ASR_MODEL`
- `VOLCENGINE_ASR_REQUEST_TIMEOUT_MS`
- `VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS`，当前示例为 30
- `VOLCENGINE_ASR_QUERY_INTERVAL_MS`，当前示例为 3000
- `EXTRACTION_JOB_TIMEOUT_MS`，当前示例为 300000
- `EXTRACTION_JOB_TTL_MS`，当前示例为 900000

本地/内部测试变量：

- `TIKHUB_TEST_DOUYIN_URL`
- `TIKHUB_TEST_DOUYIN_URLS`
- `ASR_AUTHORIZED_MEDIA_URL`

这些测试变量不应作为生产用户链路的固定输入。

备份：

- `BACKUP_AGE_RECIPIENT`（仅 age 公钥；解密 identity 不得放在服务器）
- `COS_BUCKET`
- `COS_REGION`
- `COS_ENDPOINT`
- `COS_ACCESS_KEY_ID`
- `COS_SECRET_ACCESS_KEY`

## 安全要求

- 所有 Key 只能放在服务端环境变量或部署平台 Secret。
- 不使用任何 `NEXT_PUBLIC_*` Key。
- 前端响应不返回完整媒体 URL、Provider 原始响应、ASR 原始响应或内部 endpoint。
- 日志只允许记录状态、错误类型、耗时、长度、段数；不得记录完整口播文案、完整最终文案、完整媒体 URL 或 Key。
- 抖音提取失败统一展示：`当前链接无法自动提取，请更换可提取的抖音视频链接`。

## Provider 配置确认

上线前确认：

- `DOUYIN_PROVIDER=blocked` 时，提取 API 固定失败且不调用 TikHub/ASR。
- `DOUYIN_PROVIDER=tikhub` 时，必须配置 TikHub 服务端 Key/Base URL。
- TikHub 返回短 transcript 且有 media URL 时，服务端应优先走 ASR。
- 火山 ASR submit/query 超时、处理中、失败时，不返回假 transcript。
- DeepSeek 缺 Key、超时或失败时，不返回假拆解或假最终文案。
- 临时公网 IP 模式下，`NEXT_PUBLIC_APP_URL` 与 `APP_ORIGIN` 必须都指向 `http://<公网 IP>`，`EXTRACTION_WORKER_CONCURRENCY=1`；未显式授权时 `DOUYIN_PROVIDER` 必须保持 `blocked`，显式授权后才允许 `tikhub`。

## 人工验收路径

至少验证：

1. 注册/登录。
2. 创建商家项目。
3. 进入 `/generate`，选择当前用户项目。
4. 输入可提取抖音链接。
5. 页面展示参考结构，每段包含结构名称和原文片段。
6. 选择 15-30、30-60 或 60-90 秒生成最终文案。
7. 复制按钮可用并显示反馈。
8. 无效链接展示固定失败提示。
9. 未登录访问 `/generate` 跳转登录。
10. 用户不能使用其他用户的项目生成。

## 本地生产模式演练

P1-15 演练要求：

1. 运行 `npm run build`。
2. 运行 `npm run start`。
3. 验证 `/`、`/login`、`/register` 可访问。
4. 验证未登录访问 `/generate` 跳转 `/login`。
5. 使用临时账号和临时商家项目验证生成页链路。
6. 演练后清理临时账号、项目和邀请码。

如果 TikHub 命中 media URL 但火山 ASR 一直保持 submitted，应优先按媒体长度和页面可接受等待时间调整：

- `VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS`
- `VOLCENGINE_ASR_QUERY_INTERVAL_MS`

不要在 ASR 未返回 transcript 时伪造提取成功。

P1-15 演练结论：

- 本地生产模式可启动，基础页面和未登录跳转通过。
- 该结论对应历史 SQLite 阶段；当前代码已经切换为 PostgreSQL schema 和独立 Worker，不再以 SQLite 作为生产候选。
- 对 Vercel、Serverless 或无持久磁盘平台，仍必须外置 PostgreSQL 和长运行 Worker/队列。
- 当前同步 ASR 请求可能等待 90 秒以上仍返回 submitted；这类链路不适合短超时 Serverless。上线前应评估异步 ASR 任务、前端轮询或选择能稳定直接返回 transcript 的合规 Provider。

P1-16 异步提取说明：

- 页面应通过 `POST /api/douyin/extraction-jobs` 创建提取任务，再轮询 `GET /api/douyin/extraction-jobs/:id`。
- `ExtractionJob` 只用于技术运行状态，不是用户可见历史记录功能。
- 成功任务只向当前登录用户返回 transcript；不得返回 media URL、Provider 原始响应、ASR 原始响应或内部 endpoint。
- 完整链接只在处理期间临时存放，任务终态后清空；长期只保留 host/hash 摘要。
- transcript 首次被当前用户读取后清空；过期任务在创建/查询入口机会式删除。
- 当前本地实现适合单实例演练。多实例、Serverless 或正式生产流量建议改为持久队列/后台 worker，并使用 PostgreSQL 等生产数据库。
- 如果外部 Provider 异常或任务超时，页面继续展示固定失败提示，不伪造提取成功。

P1-17 已完成代码交付：PostgreSQL schema、独立 worker、数据库会话、后台 RBAC/TOTP、用量聚合、Docker/Caddy、备份和 CI/CD。云资源开通、EdgeOne 控制台规则、正式域名和真实 PostgreSQL 恢复演练仍必须在 staging 完成，详见 `docs/PRODUCTION_RUNBOOK.md`。

P1-18 本地收口状态：代码、migration SQL、Prisma Client、自动化测试、构建、YAML 和 shell 语法已通过；CI/发布已增加 PostgreSQL migration 阻断。首期固定单 Worker 副本，该进程内并发上限为 2，每用户同时处理上限为 2；这不是跨多个 Worker 副本的全局并发保证。由于本机无 Docker 和可连接 PostgreSQL，真实 migration、并发抢占、重试/超时/重启恢复、备份恢复、Caddy 回源和发布回滚仍为 staging 阻断项。

## 回滚与禁用 Provider

外部 Provider 异常时：

1. 将 `DOUYIN_PROVIDER` 改为 `blocked`。
2. 重新部署或刷新运行时环境。
3. 验证提取 API 返回固定失败提示，不生成假 transcript。
4. 保留登录、项目管理、DeepSeek 服务代码不变。

DeepSeek 异常时：

1. 移除或暂停 `DEEPSEEK_API_KEY`。
2. 验证拆解/生成 API 返回用户可理解失败，不生成假结构或假文案。

临时公网 IP 模式撤销时：

1. 恢复 `.env.production` 中的正式 HTTPS `NEXT_PUBLIC_APP_URL` 与 `APP_ORIGIN`。
2. 删除或清空 `.env` 中的 `STAGING_ALLOW_IP_HTTP`。
3. 重新执行 `deploy_mode=standard` 或正常 `staging` push。

## 上线前阻断项

- 构建失败。
- 任意真实 Key 出现在源码、文档、日志或前端 bundle。
- 前端可见完整媒体 URL、Provider 原始响应、ASR 原始响应或内部堆栈。
- Provider 不可用时仍返回假 transcript。
- DeepSeek 不可用时仍返回假拆解或假最终文案。
- 页面出现上传、手动粘贴、历史记录、站内编辑、支付、会员等 PRD 外入口。
- staging 未完成 PostgreSQL migration、Web/Worker 双进程、Worker 并发与重启恢复验证。
- staging 未完成 EdgeOne 绕过检查、加密备份恢复、镜像回滚和基础负载验证。
- Worker 运行副本数不是 1，或有人绕过部署脚本手工扩容 Worker。

## V2 爆款选题上线增量清单（实施中）

1. 更新并审查 Prisma migration：`User.dailyTopicLimit`默认5，`DailyUsage.topicIdeasGenerated`默认0；先在staging执行，再部署应用。
2. 确认 `/topics` 登录保护、项目归属、最新资料读取、`PROJECT_PROFILE_CHANGED`、分析每小时20次和生成每小时10次限制。
3. 使用真实DeepSeek验证：5×5坐标完整、固定10种爆款元素安全改写、Top 3覆盖`traffic/trust/conversion`且不重复，不允许Mock作为验收结果。
4. 验证只有完整25条 + Top 3成功才在事务内扣1次；默认每日5次、后台调整、上海时区重置及并发防绕过通过。
5. 验证桌面1280/1440、移动375/390、详情抽屉、复制、键盘焦点、Escape和减少动态模式。
6. 上线前依次运行全量测试、typecheck、lint、build；生产先备份数据库、执行migration，再部署并检查失败率、Token成本、额度和Top 3完整率。
7. 回滚时部署上一应用版本并隐藏入口；新增字段保留，不执行破坏性数据库回退。
8. 确认独立 `topic-worker` 恰好1个副本，并验证任务入队请求在网关15秒内返回、Worker锁续租、崩溃恢复、幂等请求及首次读取后清理。
9. 确认 `TOPIC_JOB_RUN_TIMEOUT_MS`（默认5分钟）小于终态保留 TTL，并验证超时释放、刷新恢复、用户取消及取消/完成竞态不重复扣额。
10. 在 CI 数据库和已启动的 `topic-worker` 容器内执行 `npm run worker:topics:check`。该检查必须实际加载完整 Worker 依赖、连接数据库并执行期限恢复逻辑；导入失败、数据库不可达或容器反复重启均触发发布失败与回滚，不能只以容器条目存在作为健康依据。
11. Extraction Worker 发布门禁必须同时满足单副本、Web/数据库健康，以及当前部署后新启动的 Worker 容器产生的 `douyin_extraction_worker_tick`。验证按精确容器实例与其启动时间过滤日志，且只输出固定脱敏类别；旧容器日志、共享队列繁忙或 retention 缓慢不能作为新版本失败的理由。隔离 PostgreSQL 的 `worker-functional.test.ts` 保留为 claim 到 `EXTRACTION_SOURCE_EXPIRED` 代码路径测试，不在 staging deploy 中创建共享队列临时任务。
11. 需要诊断真实选题失败时运行 `Staging Topic Worker sanitized logs` 手动 workflow；它只能输出 `topic_generation_failed/succeeded` JSON事件，禁止输出容器完整日志、Prompt、商家正文、模型原文或环境变量。

任一条件未通过时保持“实施中”，不得标记已上线。新增阻断项包括：AI返回半成品、出现脚本类型旧字段、爆款元素越界/不安全、Top 3重复或缺目标、失败请求扣额度、并发超额、Topic Worker未运行或真实DeepSeek异步任务不可用。

## 定制化脚本 staging 增量清单（实施中）

1. 先在 staging 执行 `20260714000100_add_custom_script_generation_jobs` migration；新增表保留，不做破坏性回退。
2. `custom-script-worker` 必须恰好运行1个副本，且在 CI 与容器内通过 `npm run worker:custom-scripts:check`；发布脚本会把副本数、数据库连通和期限恢复检查作为发布门禁。
3. 验证任务创建后120秒截止、30秒租约、10秒心跳、最多2次语义尝试、30分钟终态清理；Worker 崩溃接管时不得让旧租约写回或额外扣额度。
4. 使用外部域名完成5次真实 DeepSeek 测试：自由需求2次、普通选题2次、Top 3一次。每条80—350内部安全范围内的合规结果必须走单次Provider成功路径并确认`providerCallsStarted=1`；只有低于80、超过350、空响应、非法JSON或领域校验失败允许最多一次重试。页面继续表达约200—350字创作目标，Prompt保持240—300且不得暴露80内部底线。只记录脱敏耗时、Token、缓存命中、Provider调用次数和错误分类，不记录商家正文、用户需求、Prompt、原始响应或生成正文。
5. 验证同一用户只有一个活动任务、UUID幂等、每小时10次、共享脚本日额度、取消/完成竞态，以及失败、`needs_profile`、非法输出均不扣成功额度。
6. 运行20组事实边界用例，确认价格、活动、地址、工艺、数据、资质、功效和服务行为不得脱离当前商家资料；每条成功结果必须处于80—350内部安全范围，页面创作目标约200—350字，Prompt目标保持240—300并强调完整安全口播优先、不得为凑字编造事实，段落、换行和单句长度不作为拒绝条件。
7. 上线前必须通过全量测试、typecheck、lint、build、桌面与移动端真实页面流程；本阶段只验证 staging，未获用户明确授权不得推生产。

任一条件失败时保持“实施中”。回滚应用时隐藏定制化脚本入口并恢复上一镜像；新增数据库表保留，过期任务仍由新版本重新上线后的 Worker 清理。
