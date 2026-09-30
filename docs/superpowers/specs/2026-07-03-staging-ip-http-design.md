# 无域名公网 IP 临时 Staging 部署设计

## 目标

为香港自托管 Runner 增加一个显式、独立、可审计的临时 Staging 部署模式，让少量可信测试人员可通过公网 IP 的 HTTP 访问应用，同时不削弱正式域名、HTTPS 和 EdgeOne 回源校验的正式部署语义。

## 设计选择

采用“GitHub Actions 显式模式开关 + 服务器侧允许标志”的双重控制：

1. GitHub Actions 是主开关。
   - `workflow_dispatch` 显式传入部署模式，形成审计记录。
   - 普通 `staging` 分支 push 仍走正式 `standard` 模式，不会意外切到临时模式。
2. 服务器环境是二次保护。
   - 临时 `ip-http` 模式必须同时满足服务器侧允许标志。
   - 即使工作流被误触发，服务器未授权时也会 fail-fast 阻止部署。

不采用“在正式 Caddyfile 中加条件分支”或“复制一整套独立部署栈”：

- 前者会把正式和临时语义混在一起，回归风险高。
- 后者维护成本高，容易和正式栈漂移。

## 架构

部署继续复用现有自托管 Runner、本机同步、GHCR 拉镜像和 `deploy/deploy.sh` 回滚机制。新增内容只包括：

- 一个临时模式专用 Compose 文件。
- 一个临时模式专用 Caddy 配置。
- 一个部署前环境校验脚本。
- workflow 中的显式部署模式参数和传递。

正式模式仍使用：

- `compose.yml`
- `deploy/Caddyfile`

临时模式使用：

- `compose.ip-http.yml`
- `deploy/Caddyfile.ip-http`

## 行为边界

### 临时模式能做什么

- 允许通过服务器公网 IP 的 HTTP 80 访问应用首页、登录页、注册页和受保护业务页面。
- 保持 Caddy 为唯一公网入口。
- 继续复用现有 Web、Worker、PostgreSQL、回滚和健康检查逻辑。
- 对 2 核 2GB staging 固定单 Worker，且 `EXTRACTION_WORKER_CONCURRENCY=1`。
- 默认强制 `DOUYIN_PROVIDER=blocked`，避免临时环境误触发真实外部能力。

### 临时模式不能做什么

- 不是生产安全方案。
- 不提供 TLS，不适合公开推广流量。
- 不替代正式域名、HTTPS、EdgeOne、COS 和正式 Provider 联调。
- 不允许承载真实敏感数据。
- 不允许长期保持开启；切回正式域名模式后应撤销。

## 环境变量策略

部署前必须对服务器 `/opt/douyin-script/.env` 和 `/opt/douyin-script/.env.production` 做 fail-fast 校验。校验只输出缺失变量名，不输出值。

校验分两层：

1. 通用必填：
   - Compose 和应用启动必需项，例如 `POSTGRES_PASSWORD`、`DATABASE_URL`、`SESSION_SECRET`。
2. 模式专属：
   - 正式模式要求正式域名和 EdgeOne 回源校验变量。
   - 临时模式要求服务器显式允许标志，并要求面向公网 HTTP 的应用 URL/Origin 已设置。

## 回滚兼容

`deploy/deploy.sh` 继续作为唯一发布与回滚入口。临时模式只是通过显式 Compose 文件列表切换运行配置，不改变：

- Web 健康检查
- 单 Worker 副本检查
- Worker 功能探针
- 失败自动回滚
- `.deployed-image-tag` 成功更新条件

## 测试策略

自动化测试覆盖：

1. workflow 模式选择和 Runner 约束。
2. 自托管部署脚本对部署模式的传递。
3. 环境变量校验只输出变量名。
4. 临时模式只暴露 Caddy 80 端口，不暴露 PostgreSQL、Web、Worker。
5. 正式 Caddyfile 仍保留域名和 EdgeOne 回源保护。
6. 临时模式使用独立 Caddy 配置，不要求回源头。
7. 回滚脚本仍通过原有测试。

## 风险

1. 临时 HTTP 模式天然没有传输层加密，只适合可信测试人员。
2. 服务器若未配置正确的 `NEXT_PUBLIC_APP_URL` 和 `APP_ORIGIN`，登录和写请求可能失败。
3. 如果部署后忘记切回正式模式，会让正式域名接入准备被延后，但不会修改正式配置文件本身。
