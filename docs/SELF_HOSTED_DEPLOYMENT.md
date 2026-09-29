# 香港 Staging 自托管 Runner 部署设计

## 目标与选择原因

香港 staging 使用服务器本机的 GitHub Actions Runner 执行部署，不再允许 GitHub 托管 Runner 通过公网 SSH 操作服务器。`verify` 和 `image` 仍在 `ubuntu-latest` 执行，避免 2 GB 服务器承担依赖安装、测试或镜像构建。

该设计减少公网 SSH 私钥、known_hosts 和远程复制链路，将服务器操作限制在已经注册且带 `staging-hk` 标签的 Runner。镜像仍由托管 Runner 构建并按 commit SHA 推送 GHCR，服务器只拉取和运行已验证镜像。

## 流程

1. `verify` 在 GitHub 托管 Runner 运行 migration、测试、lint、类型检查、构建和依赖审计。
2. `image` 在 GitHub 托管 Runner 构建镜像，以当前 commit SHA 标记并推送 GHCR。
3. 普通 `staging` push 仍启动正式 `standard` deploy；需要无域名公网 IP 演练时，必须通过 `workflow_dispatch` 显式选择 `deploy_mode=ip-http`。
4. 仅 `staging` 分支启动 `deploy`；job 必须匹配 `self-hosted, Linux, X64, staging-hk`，环境固定为 `staging`。
5. 自托管 Runner checkout 当前 SHA，运行 `deploy/self-hosted-deploy.sh`。
6. 脚本仅同步白名单文件到 `/opt/douyin-script`，先校验服务器 `.env` / `.env.production` 必填变量，再使用临时 Docker 配置和只读 packages token 登录 GHCR。
7. 脚本调用现有 `deploy/deploy.sh`，后者拉取当前 SHA 镜像、固定单 Worker、验证 Web/Worker，并在失败时回滚。
8. 无论成功或失败，临时 GHCR 登录都会退出并删除临时 Docker 配置。

## 文件边界

允许更新：

- `compose.yml`
- `compose.ip-http.yml`
- `deploy/Caddyfile`
- `deploy/Caddyfile.local`
- `deploy/Caddyfile.ip-http`
- `deploy/backup/Dockerfile`
- `deploy/backup/backup.sh`
- `deploy/deploy.sh`
- `deploy/server-hardening.sh`
- `deploy/self-hosted-deploy.sh`
- `deploy/validate-env.sh`

同步不使用递归复制、rsync `--delete` 或目标目录清空。服务器已有 `.env`、`.env.production`、`.deployed-image-tag`、数据库卷、备份和其他运行数据不在同步白名单内。

## 权限与安全

- workflow 默认无权限；`verify` 只读 contents，`image` 只读 contents/写 packages，`deploy` 只读 contents/packages。
- checkout 禁止持久化 Git 凭据。
- GHCR token 只在 deploy step 环境中存在；登录使用 `--password-stdin`，随后立即从环境移除。
- Runner 使用临时 `DOCKER_CONFIG`，不会覆盖用户或系统现有 Docker 凭据。
- Runner 服务账号必须是专用非 root 账号，只获得 `/opt/douyin-script` 写权限和运行 Docker 所需权限。
- `ip-http` 模式必须同时满足 GitHub Actions 显式模式输入和服务器 `.env` 中的 `STAGING_ALLOW_IP_HTTP=1`，避免误切换。
- 如需在 `ip-http` staging 启用真实 Provider，还必须额外设置 `STAGING_ENABLE_REAL_PROVIDERS=1`；否则部署前校验会要求 `DOUYIN_PROVIDER=blocked`。

## 临时公网 IP 模式

- `ip-http` 是专门给无域名阶段的可信测试人员准备的临时模式。
- 该模式使用 `compose.ip-http.yml` 和 `deploy/Caddyfile.ip-http`，只开放 HTTP 80，不要求 EdgeOne 回源请求头。
- 该模式固定 `EXTRACTION_WORKER_CONCURRENCY=1`。`DOUYIN_PROVIDER` 默认仍为 `blocked`；只有显式授权并补齐 TikHub / 火山 ASR / DeepSeek 变量后，才允许改为 `tikhub`。
- 切换、撤销步骤和能力边界见 [STAGING_IP_HTTP_MODE.md](/Users/douwenkai/Documents/yun ying/docs/STAGING_IP_HTTP_MODE.md)。

## 能力边界与风险

- 该改造只提供 staging 本机发布通道，不代表香港 staging 已成功部署。
- `main` 仍执行验证和镜像构建，但不会使用 `staging-hk` Runner，也不会自动部署 production。
- 自托管 Runner 能执行仓库代码，因此 `staging` 分支保护、环境审批和 Runner 账号隔离是必要前提。
- Runner、Docker daemon 或服务器本身不可用时，deploy job 会失败；现有应用回滚只处理 Compose 发布失败，不替代服务器级灾备。
- COS、EdgeOne、真实 Provider 和生产域名仍需独立 staging 验证。
