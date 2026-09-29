# 香港生产部署运行手册

## 已实现架构

- EdgeOne 代理正式域名并提供 WAF、CC/DDoS 与边缘 HTTPS。
- 香港轻量服务器运行 Caddy、Next.js Web、Extraction Worker、PostgreSQL 和备份任务。
- Caddy 是唯一入口；PostgreSQL、Web 和 Worker 均不映射公网端口。
- Caddy 校验 `X-EdgeOne-Origin-Verify`，不匹配即返回 403。服务器防火墙仍应尽量只允许 EdgeOne 回源 IP 访问 80/443。
- Web 只创建提取任务；首期部署固定为单 Worker 副本，该进程内默认并发 2，通过 PostgreSQL 状态更新原子抢占、有限重试、超时恢复。当前不声明跨多个 Worker 副本的全局并发上限。
- 全部业务时间口径使用 `Asia/Shanghai`，数据库时间保存为 UTC。

## 首次部署

1. 创建 GitHub 私有仓库，建立 `staging` 与 `main` 分支并启用分支保护。
2. 在服务器创建专用非 root Runner 账号；该账号只获得 `/opt/douyin-script` 写权限和运行 Docker 所需权限。不要配置长期 GHCR 凭证。
3. 复制 `.env.example` 为服务器 `.env.production`，另建 Compose 使用的 `.env`。不要把两者提交到 Git。Compose 中的 `DATABASE_URL` 必须使用 `db` 作为主机名；密码包含特殊字符时须先做 URL 百分号编码，不能依赖 Compose 字符串拼接。
4. 设置随机 `POSTGRES_PASSWORD`、至少 32 字符 `SESSION_SECRET`、独立的 `ADMIN_RECOVERY_CODE_PEPPER`、32 字节 Base64 的 `ADMIN_MFA_ENCRYPTION_KEY`、EdgeOne 回源秘密和 COS 凭证。
5. 首次保持 `DOUYIN_PROVIDER=blocked`，确认页面、数据库和后台后再开启供应商。无域名 `ip-http` staging 也必须先走这个默认安全路径，再通过显式授权启用真实 Provider。
6. GitHub 注册服务器自托管 Runner，标签固定为 `self-hosted, Linux, X64, staging-hk`；`staging` Environment 只允许受保护分支使用。部署不再需要公网 SSH 相关 Secret。
7. 推送 staging 后，托管 Runner 完成测试和镜像构建，自托管 Runner checkout 当前 SHA、白名单同步发布配置、使用临时 `GITHUB_TOKEN` 拉取 GHCR 镜像并执行本机部署。健康检查失败时恢复上一镜像。
8. 在服务器临时设置 `BOOTSTRAP_ADMIN_ACCOUNT`、`BOOTSTRAP_ADMIN_PASSWORD` 和 `BOOTSTRAP_ADMIN_OUTPUT_FILE`，执行 `npm run admin:bootstrap`。脚本只会将 TOTP 绑定 URI 和恢复码写入指定的全新 `0600` 文件，不会输出到终端；离线保存后立即删除该文件并清除三个变量。

生产数据库使用全新 migration 初始化；不得导入当前 SQLite 测试账号、项目、邀请码或任务。

## 无域名公网 IP 临时 Staging

该模式仅用于没有域名时的短期可信测试，不属于正式生产方案。

1. 服务器 `.env` 必须显式设置 `STAGING_ALLOW_IP_HTTP=1`，否则 `ip-http` 部署会在发布前失败。
2. `.env.production` 中的 `NEXT_PUBLIC_APP_URL` 和 `APP_ORIGIN` 必须改为 `http://<公网 IP>`，并显式设置 `SESSION_COOKIE_SECURE=false`；否则浏览器不会在 HTTP 下保存管理员或普通用户会话 Cookie。
3. GitHub Actions 必须通过手动触发并显式选择 `deploy_mode=ip-http`；普通 `staging` push 不会自动切到该模式。
4. 临时模式只开放 Caddy 的 HTTP 80；数据库、Web 内部端口和 Worker 不暴露公网。
5. 临时模式固定 `EXTRACTION_WORKER_CONCURRENCY=1`。`DOUYIN_PROVIDER` 默认仍应为 `blocked`；只有 `.env` 同时满足 `STAGING_ALLOW_IP_HTTP=1` 和 `STAGING_ENABLE_REAL_PROVIDERS=1`，并且 `.env.production` 明确设置 `DOUYIN_PROVIDER=tikhub`、TikHub/火山 ASR/DeepSeek 必需变量后，部署前校验才允许真实 Provider 进入 Web/Worker。
6. 未显式授权时，`ip-http` staging 只适合演练登录、页面和基础业务路径；显式授权后可做真实提取链路联调，但仍不属于正式生产安全方案。
7. 正式上线前必须撤销该模式，恢复正式域名、HTTPS 和 EdgeOne 回源头校验。

详细步骤与边界见 [STAGING_IP_HTTP_MODE.md](/Users/douwenkai/Documents/yun ying/docs/STAGING_IP_HTTP_MODE.md)。

## 本地 PostgreSQL

安装 Docker 后运行 `npm run db:up`，确认 `.env` 的 `DATABASE_URL` 使用 `.env.example` 中的本地 PostgreSQL 地址，再运行 `npm run db:migrate` 和 `npm run dev`。本地不再使用 SQLite；`npm run db:down` 只停止容器，不删除开发卷。

## EdgeOne

- 源站填写香港服务器域名或 IP，回源 Host 必须等于 `APP_DOMAIN`。
- 自定义回源请求头：`X-EdgeOne-Origin-Verify: <随机高强度值>`，必须配置为覆盖客户端同名请求头，并与服务器变量一致。
- 开启托管 WAF、Bot/CC 防护、HTTPS 强制跳转；后台路径 `/admin*` 使用更严格频率规则。
- 不缓存 `/api/*`、`/admin*`；静态 `_next/static/*` 可缓存。
- 公网开放前，从非 EdgeOne 路径直连源站验证返回 403。

## 备份与恢复

- Backup 容器每日执行 `pg_dump --format=custom`，使用 age recipient 公钥加密后上传 COS；服务器不保存解密 identity。
- `daily/` 保留 7 天，`weekly/` 每周日生成并保留 28 天。
- 恢复演练必须在隔离数据库执行：下载备份、`age --decrypt`、`pg_restore --clean --if-exists`，然后核对用户数、项目数、邀请码状态和最近用量日期。
- age 解密 identity 必须离线保管且与 COS 凭证分离。每季度轮换 COS 密钥。

## 监控与告警

上线即配置：

- `/api/health` 连续失败或 5xx 比例异常。
- `ExtractionJob` queued 数量、最老 queued 等待时间、failed 比例。
- Provider 失败率和后台估算费用日环比异常。
- 管理员/用户登录失败和限流次数。
- 磁盘使用率 75% 预警、85% 严重；PostgreSQL 容器重启；最近备份超过 26 小时。

应用不记录密码、Key、TOTP、完整分享链接、transcript、生成文案或第三方原始响应。排障只使用错误类型、计数、耗时和脱敏 ID。

## 发布与回滚

- `staging` 和 `main` 每次提交先通过 PostgreSQL migration、lint、类型检查、单元测试、构建和高危依赖审计。
- `verify` 和 `image` 固定使用 GitHub 托管 `ubuntu-latest`；2 GB 香港服务器不执行 `npm ci/test/build` 或 Docker build。
- 只有 `staging` 分支的 deploy job 使用 `staging-hk` 自托管 Runner；`main` 不会自动部署到 staging 服务器。
- 自托管部署只覆盖明确白名单文件，不删除 `.env`、部署状态文件、数据库卷或备份。GHCR 登录使用临时 Docker 配置，发布结束后退出并删除。
- 镜像按 Git commit SHA 标记。`deploy/deploy.sh` 保存上一个成功 SHA；新版本健康检查失败自动回滚 Web 与 Worker。Extraction Worker 的发布门禁不创建共享队列临时任务：它要求单副本、Web/数据库健康，并只检索本次启动的精确 Worker 容器自启动后产生的 `douyin_extraction_worker_tick`。容器重启、实例不匹配或无新 tick 均以固定脱敏类别失败并触发既有回滚。该 tick 只证明 Worker 进程已启动并完成一次安全扫描，不能单独证明任意业务任务、Provider 或 retention 行为正确；隔离 PostgreSQL 的 `worker-functional.test.ts` 仍覆盖 claim 到 `EXTRACTION_SOURCE_EXPIRED`。
- Provider 紧急止损：设置 `DOUYIN_PROVIDER=blocked`，并在 `ip-http` staging 同时清空或设回 `STAGING_ENABLE_REAL_PROVIDERS=0` 后重新部署，不修改用户、项目或 AI 数据。
- 数据库 migration 必须前向兼容上一版应用。破坏性 schema 变更拆成“先扩展、后切换、再清理”至少三个版本。

自托管部署的详细权限、白名单和风险见 `docs/SELF_HOSTED_DEPLOYMENT.md`。

## 上线门槛

- 完成 PostgreSQL migration、Worker 重启/抢占/超时测试、跨账号与后台越权测试。
- 完成 TOTP、恢复码、会话撤销与账号停用测试。
- staging 执行 OWASP ZAP、`npm audit`、敏感信息扫描和 10 并发基础负载。
- 完成一次真实加密备份恢复和一次镜像回滚。
- 正式域名、备案/合规路径、EdgeOne 回源规则和供应商协议均已确认。

## P1-18 本地收口结论

- PostgreSQL schema、Prisma Client、initial migration SQL、63 个自动化测试、lint、类型检查、生产构建、部署 YAML 和 shell 语法均已完成本地静态验证。
- CI 和发布工作流已增加 PostgreSQL 服务及 `prisma migrate deploy` 阻断；单 Worker 副本的进程内默认并发为 2，每用户同时处理任务上限 2，并按任务持久化的重试上限恢复。
- Compose 要求显式提供完整 `DATABASE_URL`，避免数据库密码中的特殊字符破坏连接串；备份任务增加退出清理，管理员初始化秘密只写入权限受限的一次性文件。
- 该 P1-18 结论已被后续 P1-19 演练取代；最新运行事实以 `docs/P1-19-EXECUTION-REPORT.md` 为准。
- 依赖审计未发现 high/critical，仍有 2 个来自 Next.js 构建依赖链的 moderate 问题；不使用破坏性强制修复，待框架升级窗口处理。
- P1-18 当前状态为 `BLOCKED`：香港 staging 的 PostgreSQL、Web/Worker、EdgeOne 回源、COS 备份、发布回滚和基础负载必须在真实资源就绪后验证，不能以本地静态检查替代。
- 首期只允许一个 Worker 副本。Compose 固定 `replicas: 1`，部署脚本显式 `--scale worker=1` 并检查运行副本数；不得手工扩容 Worker。后续若需要多副本，必须先实现数据库级全局并发配额或外部队列。
- **Worker 状态区分**：`running`（容器存在）≠ `healthy`（PostgreSQL 可连接）≠ `functional`（周期性恢复任务正常）。Worker healthcheck 使用 `pg_isready` 验证数据库连接；功能性任务验证需通过创建测试任务确认 Worker 抢占并到达预期终态。
- 发布脚本将 Web 健康和单 Worker 副本作为同一个成功条件。任一检查失败时，有上一成功标签则恢复旧 Web/Worker、保持 `worker=1` 并重新验证两项条件；没有上一标签则停止未验证的 Web/Worker。只有新版本两项检查均通过才更新 `.deployed-image-tag`，回滚复验失败只输出固定安全摘要并保持非零退出。

## P1-19 本地 Staging 状态

当前状态：P1-19 本地 staging 已由独立 Acceptance Agent 验收；自托管部署与 `ip-http` 临时模式代码/部署策略已验收至 `READY_FOR_SERVER_CONFIGURATION`；香港云端仍未验证。详细事实见 `docs/STAGING_RUNTIME_HANDOFF.md`。

- RUNTIME-003 Worker 恢复是有效要求，不存在“经产品确认不修复”的决策。隔离 PostgreSQL 已真实验证 stale lock、未过期锁、maxAttempts、expiresAt、并发抢占、进程重启和周期恢复。
- `pg_isready` 只代表 `database_reachable`；部署还必须运行一次性脱敏任务探针才能声明 `worker_functional`。
- 生产/正式 staging Caddy 使用 `deploy/Caddyfile`，显式声明 HTTP/HTTPS 双协议并关闭自动 HTTPS 重定向，避免 EdgeOne 回源协议被源站再次改写；本地 HTTP 演练使用 `deploy/Caddyfile.local`。两者均保留 EdgeOne 回源秘密头校验。
- Docker 镜像已连续构建并通过独立验收，lockfile 未变化。
- 新隔离 Compose、Caddy 403/正确头、migration status、Worker 功能探针和 89 项 PostgreSQL 全量测试已实际完成，结果为 0 fail、0 skip。
- 管理员/安全/运营 staging 运行测试、age 加密隔离恢复、本地发布回滚和 k6 10 并发已实际完成。
- 有效 ZAP baseline 已通过运行时 Replacer 扫描 200 应用页面，high/critical 为 0；剩余 warning 和 COS 云恢复仍需在香港 staging 复核，不能标记为云端已验证。
- 自托管 Runner workflow 必须独立验收后才能用于香港 staging；香港服务器、EdgeOne 和 COS 仍不能写成已部署或已验证。
