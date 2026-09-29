> 以下为来源项目的历史记录，不代表基础版当前部署或验收状态。当前交付范围见 README.md；本次拆分验证见 docs/CORE_EDITION_VERIFICATION.md。

# P1-19 本地 Staging 运行交接

更新时间：2026-07-04（Asia/Shanghai）
当前状态：**READY_FOR_SERVER_CONFIGURATION（P1-19 本地 staging 已验收；IP/HTTP 临时模式代码与部署策略已独立验收通过；香港真实 IP staging 尚未执行）**

## 唯一事实口径

- P1-20 已完成仓库层面的安全止血：临时 `bootstrap-admin` HTTP 路由不再保留在代码库，本地部署文档和工作日志已替换为占位符，不再记录真实部署密钥。这样做的优点是可以恢复仓库可信基线，避免浏览器/API 面暴露管理员初始化能力，也避免后续复制文档时继续扩散密钥。
- P1-20 的能力边界仅限仓库侧止血，不能替代服务器与供应商侧的真实密钥轮换；在完成轮换前，不应把当前 staging 视为重新获得完全可信状态。
- 独立 Acceptance Agent 已验收 `staging` 业务提交 `472684d6dc3e3b8300f1e2ae30f661c49a02bc75`。
- 新鲜验收结论记录在 `docs/P1-19-ACCEPTANCE-REPORT.md`，状态为 `ACCEPTED`。
- 前次 standalone 静态资源 404 阻断已消除：全新镜像和空测试卷环境中，真实首页引用的 11 个 CSS/JS 全部返回 200。
- P1-19 仅完成本地 staging 收口；COS、EdgeOne 和香港服务器仍为 `NOT_VERIFIED`。
- Provider 固定为 `blocked`，本轮未调用 TikHub、ASR 或 DeepSeek。
- 部署 workflow 已由独立 Acceptance Agent 复核：`verify` 与 `image` 保持 GitHub 托管 Runner，`deploy` 仅限 `staging-hk` 自托管 Runner；这代表部署策略通过，不代表香港服务器已发布成功。
- `a8a192a1c1ec66235e3f0ed4ec743dab625e8760` 新增的无域名公网 IP 临时 staging 模式已独立复核通过：必须手动选择 `deploy_mode=ip-http`，并要求服务器 `.env` 显式开启 `STAGING_ALLOW_IP_HTTP=1`；这不是正式生产安全方案。
- `ip-http` 模式中的真实 Provider 默认仍关闭。只有服务器 `.env` 额外显式设置 `STAGING_ENABLE_REAL_PROVIDERS=1`，且 `.env.production` 明确配置 `DOUYIN_PROVIDER=tikhub` 与 TikHub / 火山 ASR / DeepSeek 变量时，部署前校验才允许真实提取链路进入 Web/Worker。
- IP HTTP 临时模式要让管理员和普通用户登录生效，服务器 `.env.production` 还必须显式设置 `SESSION_COOKIE_SECURE=false`；正式模式则必须保持 `true`。
- `e2cd487978c1382212f2b2edd2f64fcc65f5f6d8` 已由独立 Acceptance Agent 复验通过代码层门禁：默认/正式模式 Cookie 保持 `Secure`，只有显式 `SESSION_COOKIE_SECURE=false` 的临时模式才关闭；但香港真实 IP staging 还未重新部署，因此浏览器登录闪回修复仍待部署后复测。
- 针对提交 `a8a192a1c1ec66235e3f0ed4ec743dab625e8760` 的不可变 GitHub Actions 记录已补齐：`verify` success、`image` success、`deploy` failure；该 `deploy` 为普通 push 默认 `standard` 模式，并因服务器缺少 `POSTGRES_PASSWORD` fail-fast，中断点属于服务器未配置保护，不是 `ip-http` 模式缺陷。

## 本地验收基线

- PostgreSQL 全量测试：89/89，0 fail，0 skip。
- db/web/worker/caddy 正常；测试库隔离；数据库和 Caddy 仅回环绑定；Web/Worker 无宿主端口。
- Worker 副本 1、进程内并发 2，功能探针通过。
- Caddy 回源头拒绝/放行、登录保护、管理员 RBAC/会话/TOTP、普通用户权限、CSRF、额度和运营统计通过。
- lint、typecheck、build、Prisma validate/migration status、YAML/shell 语法通过。
- npm audit 为 0 high/critical、2 moderate，未执行破坏性强制修复。
- age 加密备份与全新数据库恢复通过；真实本地成功发布和 Worker 失败回滚通过。
- k6 10 VU/60 秒为 1120 请求、0 失败、p95 69.31 ms。
- 三组有效 ZAP baseline 均扫描到应用内容，0 high/critical，HTML 引用静态资源无 404。

## 云端 Staging 必做

1. 在香港 staging 配置 managed PostgreSQL 或受控 PostgreSQL，执行 migration deploy/status 和恢复演练。
2. 部署单 Worker，确认进程内并发 2、周期恢复、任务限额和发布回滚。
3. 配置 EdgeOne 覆盖式回源头和 HTTPS，复核 Caddy 拒绝边界、安全头、CSP 与 ZAP warning。
4. 使用仅服务端 Secret 配置 Provider；先保持 `blocked` 完成基础部署，再按审批把 `.env` 中 `STAGING_ENABLE_REAL_PROVIDERS` 设为 `1`、`.env.production` 中 `DOUYIN_PROVIDER` 改为 `tikhub` 后开启外部能力。
5. 执行 COS age 加密上传、下载和隔离恢复；服务器不得长期保存解密 identity。
6. 重跑 smoke、管理员权限、k6、ZAP 和备份恢复，并记录安全摘要。

## 自托管部署待验收

Execution 自检已完成 95/95 隔离测试、lint、typecheck、build、Prisma、YAML/shell 和敏感信息扫描；该结果不替代独立验收。

1. 确认 `verify/image` 仍在 GitHub 托管 Runner 完成，香港服务器没有执行测试或构建。
2. 确认只有 `staging` deploy 使用 `self-hosted, Linux, X64, staging-hk` 和 `staging` Environment。
3. 确认 Runner checkout 当前 SHA，白名单同步不覆盖环境、部署状态和运行数据。
4. 确认 GHCR 只读 token 使用临时 Docker 配置，发布结束后退出。
5. 确认现有 Web/Worker 验证和失败回滚行为保持有效。

## 安全边界

- 不提交 `.env`、数据库、dump、age identity、provision 或 ZAP 临时报告。
- 不输出真实 Key、密码、TOTP、恢复码、完整来源、媒体 URL、transcript、生成文案或第三方原始响应。
- 不操作或合并 `main`，直到香港 staging 验证完成并由 Management 决定下一步。
