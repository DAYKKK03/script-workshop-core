# 无域名公网 IP 临时 Staging 模式

## 为什么这样设计

当前用户暂无域名，但需要短期让少量可信测试人员直接通过香港服务器公网 IP 访问 staging。正式生产仍要求域名、HTTPS 和 EdgeOne 回源校验，因此临时模式必须和正式模式分离，不能通过替换正式 Caddy 配置或弱化正式部署规则来实现。

本方案使用两层控制：

1. GitHub Actions `workflow_dispatch` 的显式 `deploy_mode=ip-http` 开关，保证每次临时部署都有审计记录。
2. 服务器 `.env` 中的 `STAGING_ALLOW_IP_HTTP=1` 二次保护，防止误触发。

当需要在 staging 上联调真实抖音提取链路时，再增加第三层显式授权：

3. 服务器 `.env` 中的 `STAGING_ENABLE_REAL_PROVIDERS=1`，并在 `.env.production` 中明确设置 `DOUYIN_PROVIDER=tikhub` 和所需 TikHub / 火山 ASR / DeepSeek 变量。

## 能做到什么

- 允许通过 `http://<公网 IP>` 访问 staging。
- 保持 Caddy 作为唯一公网入口。
- 继续复用现有镜像、回滚、健康检查和自托管 Runner 本机部署链路。
- 通过显式 `SESSION_COOKIE_SECURE=false` 允许浏览器在 HTTP 临时环境下保存管理员和普通用户会话 Cookie。
- 固定单 Worker，固定 `EXTRACTION_WORKER_CONCURRENCY=1`。
- 默认保持 `DOUYIN_PROVIDER=blocked`，只有在双重授权后才允许启用真实 Provider。
- 真实 Provider 启用时，仍只允许合规链路：TikHub transcript / 授权媒体 URL -> 火山 ASR -> DeepSeek。

## 做不到什么

- 不是生产安全方案。
- 不提供 TLS，不适合公开传播给不受控用户。
- 不替代正式域名、EdgeOne、COS、真实 Provider 和正式数据联调。
- 不会根据 URL、`NODE_ENV` 或“发现密钥存在”自动猜测要不要开真实 Provider。
- 不适合录入真实敏感业务数据。

## 部署文件

- 正式模式：`compose.yml` + `deploy/Caddyfile`
- 临时模式：`compose.ip-http.yml` + `deploy/Caddyfile.ip-http`

临时模式不会修改正式 Caddyfile，也不会关闭正式模式的域名/HTTPS/EdgeOne 语义。

## 服务器所需变量名

`.env`：

- `POSTGRES_PASSWORD`
- `APP_DOMAIN`：正式模式必填
- `EDGEONE_ORIGIN_SECRET`：正式模式必填
- `STAGING_ALLOW_IP_HTTP`：临时模式必填，值应为 `1`
- `STAGING_ENABLE_REAL_PROVIDERS`：仅临时模式启用真实 Provider 时填写 `1`

`.env.production`：

- `DATABASE_URL`
- `SESSION_SECRET`
- `ADMIN_MFA_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`
- `APP_ORIGIN`
- `SESSION_COOKIE_SECURE`
- `DOUYIN_PROVIDER`

仅当 `.env` 中显式设置 `STAGING_ENABLE_REAL_PROVIDERS=1` 时，`.env.production` 还需要：

- `TIKHUB_API_KEY`
- `TIKHUB_API_BASE_URL`
- `VOLCENGINE_ASR_API_KEY`
- `VOLCENGINE_ASR_ENDPOINT` 或 `VOLCENGINE_ASR_SUBMIT_ENDPOINT`
- `VOLCENGINE_ASR_RESOURCE_ID`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_API_BASE_URL`
- `DEEPSEEK_MODEL`

建议临时模式下把：

- `NEXT_PUBLIC_APP_URL` 设为 `http://<公网 IP>`
- `APP_ORIGIN` 设为 `http://<公网 IP>`

## 运行步骤

1. 在服务器 `/opt/douyin-script` 保留现有 `.env` 和 `.env.production`，不要提交到 Git。
2. 在 `.env` 中显式设置 `STAGING_ALLOW_IP_HTTP=1`。
3. 在 `.env.production` 中把 `NEXT_PUBLIC_APP_URL` 和 `APP_ORIGIN` 改为公网 IP 的 HTTP Origin。
4. 在 `.env.production` 中显式设置 `SESSION_COOKIE_SECURE=false`。这是临时 IP HTTP 模式允许浏览器写入会话 Cookie 的唯一合法方式。
5. 如只做基础页面和登录联调，在 `.env.production` 保持 `DOUYIN_PROVIDER=blocked`，并把 `.env` 中 `STAGING_ENABLE_REAL_PROVIDERS` 留空或设为 `0`。
6. 如需真实提取链路，在 `.env` 中显式设置 `STAGING_ENABLE_REAL_PROVIDERS=1`，并在 `.env.production` 中显式设置 `DOUYIN_PROVIDER=tikhub` 及所需 TikHub / 火山 ASR / DeepSeek 变量。
7. 在 GitHub Actions 手动运行 `Build and deploy` workflow，并选择 `deploy_mode=ip-http`。
8. 部署脚本会先校验 `.env` 和 `.env.production`。若缺变量，只会输出变量名；如果 `SESSION_COOKIE_SECURE`、授权开关或 Provider 配置与模式不一致，也会直接拒绝。
9. 部署成功后，通过 `http://<公网 IP>` 访问。

## 撤销与切回正式模式

1. 把 `.env.production` 中的 `NEXT_PUBLIC_APP_URL` 和 `APP_ORIGIN` 恢复为正式 HTTPS 域名。
2. 把 `.env.production` 中的 `SESSION_COOKIE_SECURE` 恢复为 `true`。
3. 若已启用真实 Provider，把 `.env.production` 中 `DOUYIN_PROVIDER` 改回 `blocked`，并删除或清空 `.env` 中的 `STAGING_ENABLE_REAL_PROVIDERS`。
4. 删除或清空 `.env` 中的 `STAGING_ALLOW_IP_HTTP`。
5. 通过 GitHub Actions 手动运行 `Build and deploy` workflow，选择 `deploy_mode=standard`；或者继续使用正常 `staging` push 自动部署正式模式。
6. 确认 Caddy 重新使用正式 `deploy/Caddyfile`，并恢复 80/443 正式入口。

## 风险与限制

- 临时 HTTP 模式没有 TLS，浏览器和网络路径上都没有传输层加密。
- 该模式仅适合少量可信测试人员，且应使用临时账号、临时密码和脱敏数据。
- 该模式不应与正式域名、正式回源规则同时作为长期运行状态。

## 故障排查

### 部署前就失败

优先看部署输出中的变量名列表。部署脚本会在以下情况直接失败：

- `.env` 缺 `POSTGRES_PASSWORD`
- `.env.production` 缺应用启动必需变量
- `deploy_mode=ip-http` 但 `STAGING_ALLOW_IP_HTTP` 未设置为 `1`
- `STAGING_ENABLE_REAL_PROVIDERS=1`，但 `DOUYIN_PROVIDER` 不是 `tikhub`
- 已尝试启用真实 Provider，但 TikHub / 火山 ASR / DeepSeek 必填变量缺失
- `deploy_mode=standard` 但正式域名或回源变量缺失

### 页面无法登录或写请求失败

优先检查三项是否一致：

- `NEXT_PUBLIC_APP_URL`
- `APP_ORIGIN`
- `SESSION_COOKIE_SECURE=false`

临时模式下它们必须和公网 IP 的 HTTP Origin 以及 HTTP Cookie 策略一致；否则浏览器可能拒绝保存会话 Cookie，登录后会被立即送回登录页。

### 外部脚本提取不可用

先检查当前是不是有意保持默认安全模式：

- `.env` 中 `STAGING_ENABLE_REAL_PROVIDERS` 是否为空或 `0`
- `.env.production` 中 `DOUYIN_PROVIDER` 是否仍是 `blocked`

如果两者是这样，页面固定失败属于预期行为。只有在显式授权并补齐所需变量后，`ip-http` staging 才会启用真实 Provider。
