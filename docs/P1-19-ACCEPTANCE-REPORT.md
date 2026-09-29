# P1-19 独立验收报告

## 结论

- 验收日期：2026-07-01（Asia/Shanghai）
- 验收角色：Acceptance Agent
- 验收分支：`staging`
- 业务验收提交：`472684d6dc3e3b8300f1e2ae30f661c49a02bc75`
- 初始状态：HEAD 与 `origin/staging` 精确一致，工作区干净
- 最终状态：`ACCEPTED`
- 验收范围：仅本地隔离 staging；未操作 `main`，未部署香港服务器、EdgeOne 或 COS

前次 `e8e127c` 的 standalone 静态资源阻断已修复。本轮从目标提交重新构建无缓存镜像，删除旧容器和测试卷后重建隔离环境，并重新执行完整本地门禁。

## 逐项结果

| 验收项 | 状态 | 本轮独立证据 |
|---|---|---|
| Git 与安全基线 | PASS | 分支、提交、远端一致；初始工作区干净；环境文件、数据库、dump、age identity、provision 和 ZAP 报告未被 Git 跟踪 |
| 全新隔离 Compose | PASS | 从 `472684d` 无缓存构建新镜像，删除旧容器和卷后重建；db/web/worker/caddy running |
| 数据库与网络隔离 | PASS | 测试库为 `douyin_scripts_test`；PostgreSQL/Caddy 仅绑定回环地址；Web/Worker 无宿主端口 |
| 页面静态资源 | PASS | 经 Caddy 获取真实首页 HTML，解析全部 11 个引用（2 CSS、9 JS），逐个请求均为 HTTP 200；无静态资源 404 |
| Standalone 目录 | PASS | 运行目录存在 `.next/standalone/.next/static`，启动路径与 standalone server 一致；项目没有 `public/` 目录 |
| Worker | PASS | Provider 固定 `blocked`；副本恰好 1；进程内并发 2；独立功能探针通过 |
| Caddy 回源边界 | PASS | 无正确测试回源头返回 403；正确测试头访问首页、登录、注册、管理员登录和健康 API 为 200；未登录 `/generate` 为 307 到登录 |
| PostgreSQL 全量测试 | PASS | 89/89，0 fail，0 skip；包含 Worker recovery、seed、管理员 staging、凭据表单和静态资源运行时回归 |
| 管理员、权限、运营 | PASS | OWNER bootstrap 与 `0600` provision、RBAC、会话过期/撤销/强制下线、二次 TOTP、跨账号、Origin/CSRF、资源归属、每日额度、双活动任务上限和统计均由全量测试覆盖 |
| 临时数据清理 | PASS | 验收前缀用户、邀请码、任务及 provision 目录残留均为 0 |
| lint / typecheck / build | PASS | lint 0 error/0 warning；typecheck 通过；生产 build 35 routes，退出 0 |
| Prisma | PASS | PostgreSQL 协议 validate 通过；migration status 为 schema up to date |
| YAML / shell | PASS | Compose、GitHub Actions YAML 及 deploy/backup shell 语法通过 |
| 依赖审计 | PASS_WITH_WARNING | 0 high/critical；2 moderate（PostCSS 传递依赖）；未执行破坏性 force 修复 |
| 加密备份恢复 | PASS | 独立 pg_dump、age recipient 加密、明文删除、全新恢复库、1 条 migration、13 张表和记录计数核对通过；恢复库已删除 |
| 发布与回滚 | PASS | 真实 Compose 成功发布及 Worker 失败回滚通过；回滚后保留旧成功标签、Web 健康、Worker 恰好 1 且功能探针通过；全量测试另执行 deploy shell 的 Web 失败、首次失败停止和回滚复验失败等控制流 |
| k6 | PASS | 10 VU/60 秒；560 iterations、1120 requests、0 failed、0 5xx、p95 69.31 ms；队列残留 0 |
| ZAP baseline | PASS_WITH_WARNING | 首页、管理员登录、健康 API 三个目标均使用正确测试回源头扫描到应用内容；0 fail、0 high/critical；静态资源 404 为 0 |
| PRD 与敏感信息边界 | PASS | 未调用真实 Provider，未发现真实秘密或完整业务正文进入 Git，未新增上传、手动粘贴、历史、站内编辑、支付或会员入口 |
| COS 上传/云端恢复 | NOT_VERIFIED | 延至香港 staging，不属于本地通过证据 |
| EdgeOne/香港服务器 | NOT_VERIFIED | 尚未部署或验证 |

## ZAP Warning 分类

三个有效 baseline 的告警集合分别为 11、12、11 类，均无 high/critical：

- Medium：CSP `script-src unsafe-inline`、`style-src unsafe-inline`，以及扫描器未识别现有 Origin/CSRF 防护而报告表单 token 缺失。
- Low：部分静态响应缺少 `X-Content-Type-Options`、Permissions Policy、COEP/CORP；管理员扫描另识别大重定向。
- Informational：现代 Web 应用、缓存/非存储内容和认证请求识别。
- `robots.txt`、`sitemap.xml` 等非业务资源 404 仅作为信息项；所有 HTML 引用的 Next.js CSS/JS 均为 200，前次静态资源阻断已消失。

这些 warning 不阻断本地 staging，但应在 EdgeOne/HTTPS 环境复核最终安全头和 CSP。

## 安全确认

- 未读取、记录或提交本地真实秘密值。
- 未发现真实 Key、密码、TOTP、恢复码、age identity、完整来源、媒体 URL、transcript、生成文案或第三方原始响应进入 Git。
- Provider 固定为 `blocked`，未调用 TikHub、ASR 或 DeepSeek。
- 未连接生产数据库，未操作或合并 `main`。
- 本地验收生成的数据库、恢复库、容器、卷、age identity、ZAP 报告和发布夹具在报告提交前清理。

## 放行范围与下一步

`472684d` 已通过 P1-19 本地 staging 门禁，可以进入香港服务器、EdgeOne、COS staging 部署阶段。该放行不代表云端已通过：必须在香港 staging 重新验证 PostgreSQL migration、Web/Worker、EdgeOne 回源、HTTPS 安全头、COS 加密上传与恢复、真实云端回滚和外部 Provider 的受控配置。
