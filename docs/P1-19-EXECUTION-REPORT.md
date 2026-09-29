# P1-19 第二轮返修执行报告

## 身份与结论

- 角色：Execution Agent
- 日期：2026-06-30（Asia/Shanghai）
- 状态：`STATIC_ASSET_FIX_READY_FOR_REVIEW`
- 是否可交独立验收：仅静态资源返修可复验；P1-19 整体仍由独立 Acceptance Agent 判断
- 产品范围是否变化：否

本报告只记录执行与自检，不是 Acceptance 报告。`docs/P1-19-ACCEPTANCE-REPORT.md` 未由本轮修改，也不能作为独立验收证据。

## 本轮提交

- `ce1b044`：隔离 PostgreSQL 测试数据库。
- `0150981`：真实 PostgreSQL Worker recovery 测试。
- `88e83c5`：Worker 功能探针。
- `170d60f`：生产与本地 Caddy 分离。
- `3356997`：本地 Compose 独立测试库。
- `6045f32`：隔离演练配置与测试入口。
- `3f228aa`：执行报告和交接事实状态。
- `2bf0a19`：运行时管理员/安全集成验证与 `APP_ORIGIN` 修复。
- `23beb9c`：非交互 age recipient 备份修复。
- `c18e20f`：本地发布与回滚演练支持。
- `85f022e`：管理员 staging 测试依赖、错误分类和隔离数据库边界修复。
- `a0734c4`：凭据表单 POST fallback 与 ZAP 回归测试。
- `26758f3`：k6 经 Caddy 回源边界执行。

## 红绿证据与修复

### 测试与 Worker

- 旧 Worker 测试打印 `SKIPPED` 后计为通过；现改为缺测试库时由 Node runner 真实 skip，有隔离库时真实执行。
- 临时禁用周期恢复后，运行期 orphaned job 测试超时失败；恢复实现后同一测试通过。
- stale lock、未过期锁、maxAttempts、expiresAt、并发唯一抢占、进程重启和周期恢复均在隔离 PostgreSQL 中通过。
- Worker 功能探针在容器内创建脱敏任务，确认唯一 Worker 抢占并进入预期终态，随后清理临时记录。

### 运行时 CSRF Origin

- 红：测试 Compose 运行时设置公开入口后，写 API 仍返回 403。
- 根因：中间件只读取构建期固化的 `NEXT_PUBLIC_APP_URL`。
- 绿：增加服务端运行时 `APP_ORIGIN`，保留旧变量兼容；管理员 staging 集成测试通过写请求与跨 Origin 拒绝。

### 管理员 bootstrap 测试

- 红：测试只以数据库、URL 和回源头作为启用条件，遗漏管理员 MFA 加密密钥与恢复码 pepper；子进程失败被折叠为模糊断言。
- 修复：启用条件覆盖全部实际依赖，使用显式隔离 Prisma Client，并把 bootstrap 失败映射为安全错误分类。
- 绿：管理员 staging 运行测试在 Compose 隔离 PostgreSQL 中通过，provision 权限为 `0600`，临时数据与文件全部清理。

### ZAP 凭据表单

- 红：登录、注册和管理员登录表单没有原生 `method="post"`，JavaScript 未加载时可能把凭据放入查询字符串。
- 修复：三个凭据表单增加 POST fallback；客户端 API 处理逻辑不变。
- 绿：源码回归测试通过，ZAP 复扫不再报告敏感信息出现在 URL。

### Next.js standalone 静态资源

- 红：独立验收镜像的首页 HTML 引用了 11 个 `/_next/static` CSS/JS，容器运行时测试确认 11 个全部返回 404。
- 根因：standalone server 从 `/app/.next/standalone` 运行，但 Dockerfile 将静态文件复制到父级 `/app/.next/static`。
- 修复：将构建产物复制到 standalone 运行根目录下的 `.next/static`；项目当前没有 `public/`，因此没有额外 public 目录需要复制。
- 设计原因：standalone 输出不自动包含静态资源，资源必须与 `server.js` 使用同一运行根目录。直接按 Next.js 产物结构复制，不增加运行时代理或路径重写。
- 优点：镜像结构与 standalone 的文件查找规则一致；回归测试从真实 HTML 枚举全部 CSS/JS，而不是依赖固定文件名或抽样。
- 能力边界：测试保证当前页面 HTML 引用的 Next.js CSS/JS 经 Caddy 全部返回 200；不替代浏览器交互、ZAP、香港云或 EdgeOne 的独立验收。
- 绿：全新镜像和空测试卷重建后，全部 11 个引用资源返回 200；standalone 静态目录包含 58 个文件。

### age 备份

- 红：容器内 `age --passphrase` 无 TTY，`AGE_PASSPHRASE` 不能完成非交互加密。
- 修复：服务器只配置 `BACKUP_AGE_RECIPIENT` 公钥，解密 identity 离线保存。
- 绿：真实 `pg_dump`、age 加密、明文删除、全新恢复库解密恢复、migration/关键记录计数核对全部成功；临时 identity、恢复库和测试数据已清理。

### 发布回滚

- 红：`docker compose up` 本身失败时受 `set -e` 直接退出，没有进入统一回滚。
- 修复：启动失败和后续验证失败统一进入回滚；增加可选本地 Compose 文件/二进制和跳过远程准备参数，生产默认行为不变。
- 绿：真实本地镜像完成成功发布、Worker 探针失败回滚、Web 启动失败回滚、首次失败安全停止、回滚目标仍失败保持非零和旧标签。演练后恢复已验证镜像并删除本地成功标签文件。

## 运行证据

### PostgreSQL 与标准命令

- migration deploy：无待应用 migration。
- migration status：schema up to date。
- 最终完整隔离 PostgreSQL 测试：89/89、0 fail、0 skip，新增一项真实 Caddy 静态资源回归。
- 管理员 staging 运行测试包含在最终全量测试中，不复用旧的专项结果代替全量结果。
- `npm run lint`：0 error、0 warning。
- `npm run typecheck`：退出 0。
- `npm run build`：退出 0，35 routes。
- `npx prisma validate`：退出 0。
- 测试/生产 Compose 与 GitHub Actions YAML 解析通过；部署/备份 shell 语法检查退出 0。

### Docker、Caddy 与 Worker

- `running`：PostgreSQL、Web、单 Worker、Caddy 均真实启动。
- `database_reachable`：PostgreSQL healthcheck 通过。
- `web_healthy`：Web healthcheck 和 Caddy `/api/health` 通过。
- `worker_functional`：容器内一次性脱敏任务探针通过。
- Worker 副本：1；进程内并发：2。
- 无回源头健康请求：403；正确测试回源头：200。
- 首页、登录、注册：200；未登录 `/generate`：307 到 `/login`。
- Web/Worker 无宿主端口；PostgreSQL 和 Caddy 仅绑定 `127.0.0.1` 测试端口。

### 管理员、安全与运营

- 真实 bootstrap 临时 OWNER，provision 文件权限为 `0600`，读取后立即删除。
- OWNER/OPERATOR RBAC、过期/撤销管理员会话、二次 TOTP、普通用户强制下线、跨用户项目 404、跨 Origin 写请求 403 均通过。
- 每日额度、每用户最多两个活动任务、脚本/API/token/ASR/费用与邀请码三状态统计均通过脱敏运行测试。
- 临时管理员、用户、项目、任务、邀请码、审计关联记录和 rate-limit bucket 已清理；前缀残留计数为 0。

### 负载与安全工具

- k6：10 VU、60 秒、570 iterations、1140 requests、0 failed、0 5xx、p95 53.35 ms。
- ZAP 使用运行时 Replacer 注入测试回源头，没有把值写入仓库或报告。
- 首页扫描：26 URLs，包含首页、登录和注册的 200 响应；0 fail，7 类 warning，60 pass。
- 管理入口扫描：31 URLs，管理员登录为 200、未登录后台为 307；0 fail，8 类 warning，59 pass。
- API 扫描：28 URLs，健康接口为 200；0 fail，7 类 warning，60 pass。
- ZAP high/critical 为 0。原静态资源 404 已由本次返修解决；其余 warning 为 CSP `unsafe-inline`、扫描器无法识别 Origin 校验、COEP 和认证请求识别，仍需独立复验。
- `npm audit --audit-level=high`：0 high/critical，2 moderate；不执行破坏性 `--force` 降级。
- COS 上传和云端恢复缺少香港 staging 凭证，延至 staging 执行；本地 age 隔离恢复已经完成，该外部项不阻断本地独立验收。

## 安全与范围扫描

- 未发现真实 Key、密码、TOTP、恢复码、age identity、完整来源、媒体 URL、transcript、生成文案或第三方原始响应写入源码/文档/日志。
- 未连接生产数据库，未迁移 SQLite，未调用 TikHub、ASR 或 DeepSeek。
- 未新增上传、手动粘贴、历史记录、站内编辑、支付、会员或团队协作入口。
- 未修改 Docker Desktop 全局配置或系统凭证助手。

## 剩余风险与外部验证

1. 修复提交必须由独立 Acceptance Agent 使用全新镜像和空测试卷复验，不能复用 Execution 结论。
2. COS 上传和云端恢复必须等香港 staging 凭证就绪后执行，当前不得描述为已验证。
3. ZAP 的 CSP/COEP warning 需在真实 HTTPS/EdgeOne staging 上复核；当前没有 high/critical。
4. `npm audit` 仍有 2 个 moderate，强制修复会造成框架破坏性降级，留待依赖升级窗口。
5. 当前结论只覆盖本地隔离环境，不代表香港 staging 或生产已经部署。

本轮单点返修状态为 `STATIC_ASSET_FIX_READY_FOR_REVIEW`。该状态不表示 P1-19 已验收通过，也不允许直接进入香港生产。
