# P1-19 Rework And Independent Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 P1-19 当前验收缺口，在本地真实完成 PostgreSQL、Web、Worker、Caddy、备份恢复和回滚演练，并由不同于执行者的验收 Agent 独立复验。

**Architecture:** Next.js Web 只创建任务；独立 Worker 通过 PostgreSQL 原子抢占任务，过期锁必须可恢复，有限重试后进入确定终态。Caddy 是唯一应用入口，Provider 在本地演练期间保持关闭，所有证据只记录状态、计数和脱敏摘要。

**Tech Stack:** Next.js 15、TypeScript、Prisma、PostgreSQL 16、Docker Compose、Caddy、Node test runner、k6、OWASP ZAP、GitHub Actions。

---

## 1. 管理规则

### 1.1 角色分离

- **Management Agent**：只确认范围、分派、阅读报告和决定是否进入下一阶段，不修改业务代码。
- **Execution Agent**：按本计划逐项实现和自检，只能输出“可交验”或“不可交验”，不得输出“验收通过”。
- **Acceptance Agent**：必须是不同线程、不同上下文的 Agent；不得复用执行 Agent 的结论，必须亲自运行验收命令。
- **用户**：只有用户可以批准删除需求、改变 PRD、取消 Worker 恢复等产品决策。

### 1.2 状态定义

- `BLOCKED`：因外部条件无法继续，必须说明阻断项，不得伪装完成。
- `IN_PROGRESS`：正在实施，尚未形成完整交付。
- `READY_FOR_ACCEPTANCE`：执行 Agent 已完成自检，等待独立验收。
- `ACCEPTANCE_FAILED`：验收发现问题，必须退回执行 Agent。
- `ACCEPTED`：独立验收全部通过，才可进入香港 staging。

### 1.3 绝对禁止

- 不得把执行 Agent 的自检报告写成“最终验收报告”。
- 不得声称“经产品确认”而没有用户在管理线程中的明确确认。
- 不得输出、提交或记录真实 Key、密码、TOTP、恢复码、完整分享链接、完整媒体 URL、transcript、生成文案或第三方原始响应。
- 不得修改或删除用户的 `~/.docker/config.json`、Docker 登录信息和系统凭证助手配置。
- 不得调用真实 TikHub、ASR、DeepSeek；本地验收固定使用 `DOUYIN_PROVIDER=blocked`。
- 不得迁移 SQLite 测试数据到 PostgreSQL，不得连接未来的生产数据库。
- 不得新增手动粘贴、上传、历史记录、站内编辑、支付、会员或团队协作。
- 不得为了让测试通过而跳过测试、降低断言、扩大超时或写入假成功结果。

## 2. 文档与证据结构

其他 Agent 接手前必须遵守以下文件职责：

- `docs/superpowers/plans/2026-06-28-p1-19-rework-independent-acceptance.md`：本计划，只能在步骤完成后勾选，不得重写验收标准。
- `docs/STAGING_RUNTIME_HANDOFF.md`：当前事实状态和下一接手点，不能同时出现“已修复”和“仍待修复”。
- `docs/P1-19-EXECUTION-REPORT.md`：由执行 Agent 创建或更新，只记录修改、测试和剩余问题。
- `docs/P1-19-ACCEPTANCE-REPORT.md`：只能由独立验收 Agent 创建或更新。
- `project-team/work-log.md`：每轮执行或验收结束后追加一条记录，不得覆盖旧记录。
- `docs/P1-19-FINAL-REPORT.md`：保留为上一轮自检记录；在独立验收前不得继续用它证明通过。

每份证据只允许包含：命令名称、退出码、通过/失败数量、HTTP 状态、容器状态、Worker 副本数、数据库记录计数、镜像短标签和脱敏错误分类。

## 3. 实施顺序

### Task 0：建立可审计基线

**负责角色：** Execution Agent

**检查文件：**
- `.gitignore`
- `.dockerignore`
- `.env.example`
- `.github/workflows/ci.yml`
- `project-team/work-log.md`

- [x] 确认当前目录是否为 Git 仓库；若不是，先执行敏感信息扫描，再初始化本地 Git。
- [x] 确认 `.env`、`.env.local`、`.env.production`、数据库文件、备份文件、管理员 provision 文件和测试输出均被忽略。
- [x] 禁止提交任何现有环境文件；发现疑似秘密立即停止，不得自行删除或轮换。
- [x] 记录变更前文件清单和测试基线，禁止清理用户已有改动。
- [x] 每个独立任务使用单独提交；提交信息包含任务编号，不混入无关重构。

**通过标准：** 可以明确追踪本轮修改；秘密扫描无新增泄露；没有用户文件被覆盖。

**停止条件：** 扫描发现真实秘密已经被 Git 跟踪时，立即标记 `BLOCKED`，交用户决定轮换和清理方式。

### Task 1：重新确认 RUNTIME-003 根因

**负责角色：** Execution Agent

**检查与修改候选：**
- `lib/douyin/extraction-worker.ts`
- `lib/douyin/extraction-jobs.ts`
- `lib/douyin/extraction-worker-policy.ts`
- `worker/extraction-worker.ts`
- `prisma/schema.prisma`
- `tests/douyin/extraction-worker-policy.test.ts`
- 新增独立 PostgreSQL 集成测试文件，文件名必须明确包含 `worker-recovery`

- [x] 阅读现有 `recoverStaleExtractionJobs` 的调用时机、事务边界和筛选条件。
- [x] 先编写 PostgreSQL 集成失败测试：旧 Worker 留下 `processing` 和过期锁，新 Worker 启动后必须接管或进入确定终态。
- [x] 验证测试在修改前真实失败，记录失败断言，不记录任务正文或来源地址。
- [x] 做最小修复，不改变每用户最多两个活动任务、最大尝试次数和 Provider 错误边界。
- [x] 增加达到 `maxAttempts` 的旧任务测试：必须进入失败终态并清除锁与敏感来源字段。
- [x] 增加未过期锁测试：新 Worker 不得抢占。
- [x] 增加两个 Worker 并发测试：同一任务只能被一个 Worker 成功抢占。
- [x] 增加进程重启测试：停止 Worker 后启动新 Worker，旧任务不能永久停留在 `processing`。
- [x] 使用 `DOUYIN_PROVIDER=blocked` 完成功能验证，不调用付费 Provider。

**通过标准：** 旧锁可恢复、未过期锁不被抢占、尝试次数受限、任务只有一个执行者、终态清除锁和敏感字段。

**不得接受的替代方案：** 要求用户重新提交、定时人工清数据库、启动时无条件重置全部任务、把 `processing` 直接伪装成成功。

### Task 2：修正 Worker 运行状态验证

**负责角色：** Execution Agent

**检查与修改候选：**
- `docker-compose.test.yml`
- `compose.yml`
- `deploy/deploy.sh`
- `tests/deploy/staging-config.test.ts`
- `docs/PRODUCTION_RUNBOOK.md`

- [x] 不得继续声称 Worker 已有 Docker healthcheck，除非配置中确实存在且验证了业务可用性。
- [x] 首选功能性就绪验证：创建一个脱敏任务，确认唯一 Worker 抢占并到达预期终态。
- [x] 部署脚本仍须验证 Worker 副本恰好为 1，不能仅检查容器存在。
- [ ] 若增加 Worker healthcheck，必须验证 PostgreSQL 可连接和 Worker 主循环可工作；只检查 PID 存活不能作为唯一证据。
- [x] 更新报告措辞，区分 `running`、`healthy` 和“功能性任务验证通过”。

**通过标准：** 文档与实际 Compose 状态一致；Worker 的可用性有功能证据，不再把 Web healthcheck 当成 Worker healthcheck。

### Task 3：提高 Docker 构建可复现性

**负责角色：** Execution Agent

**检查与修改候选：**
- `Dockerfile`
- `package.json`
- `package-lock.json`
- `.dockerignore`
- `docker-compose.test.yml`
- `tests/deploy/staging-config.test.ts`

- [x] 检查运行镜像是否使用 lockfile 可复现安装，禁止构建过程中隐式升级依赖。
- [x] 确认 standalone Web、`.next/static`、Prisma 引擎、Worker 运行文件和生产依赖均存在。
- [x] 确认镜像内不包含 `.env*`、本地数据库、测试报告、Git 元数据和管理员 provision 文件。
- [x] 构建前后确认 `package-lock.json` 没有被 Docker 构建过程修改。
- [x] 本地构建镜像两次，至少验证启动命令、Web 健康接口和 Worker 命令一致。
- [x] 不推送镜像到公共仓库。

**通过标准：** 镜像可重复构建；启动不依赖宿主机 `node_modules`；镜像中无环境文件或测试秘密。

### Task 4：完整本地 Compose 演练

**负责角色：** Execution Agent 自检，随后 Acceptance Agent 独立重跑

**使用文件：**
- `compose.yml`
- `docker-compose.test.yml`
- `compose.dev.yml`
- `deploy/Caddyfile`
- `.env.example`

- [x] 使用全新的本地 PostgreSQL 数据库执行 `prisma migrate deploy`，不得导入 SQLite 数据。
- [x] 使用仅供本地的随机临时秘密启动 PostgreSQL、Web、单 Worker、Caddy；不得写入仓库。
- [x] 确认 PostgreSQL 和 Worker 无公网端口；Web 不直接暴露给公网；Caddy 是唯一入口。
- [x] 通过 Caddy 验证 `/api/health` 返回 200。
- [x] 验证公开页面可访问，未登录访问 `/generate` 跳转登录。
- [x] 验证无正确回源请求头时返回 403，正确头部时可访问。
- [x] 验证 Worker 副本数为 1，进程内并发设置为 2。
- [x] 完成 Task 1 的真实进程重启恢复场景。
- [x] 演练结束清理临时账号、任务和秘密文件；是否保留开发数据库容器必须写入报告。

**通过标准：** 所有服务行为与生产架构一致；无付费调用；无敏感数据残留。

### Task 5：管理员、安全与运营数据 E2E

**负责角色：** Execution Agent 自检，随后 Acceptance Agent 独立重跑

**检查区域：**
- `app/admin/**`
- `app/api/admin/**`
- `lib/admin/**`
- `lib/auth/**`
- `lib/usage/**`
- `middleware.ts`
- `tests/admin/**`
- `tests/auth/**`
- `tests/usage/**`

- [x] 创建临时 OWNER，确认 TOTP 和恢复码只写入权限为 `0600` 的临时文件，验证后立即删除。
- [x] 验证 OWNER 与 OPERATOR 权限边界，OPERATOR 不得管理管理员和账号额度。
- [x] 验证管理员会话过期、撤销、强制下线和敏感操作再次验证。
- [x] 验证普通用户跨账号访问失败，写接口执行 Origin/CSRF 和资源归属检查。
- [x] 验证每账号每日成功生成上限和每用户最多两个活动提取任务。
- [x] 验证脚本数、API 次数、token、ASR 秒数、TikHub 次数和邀请码 used/unused/disabled 口径。
- [ ] API 失败不增加脚本成功数，但真实发生的 API 用量必须保留。
- [x] 测试完成后清理临时管理员、用户、邀请码和用量记录。

**通过标准：** 权限、会话、额度和统计口径全部符合原计划；后台不展示正文或完整来源。

### Task 6：加密备份与隔离恢复

**负责角色：** Execution Agent 自检，随后 Acceptance Agent 独立重跑

**检查文件：**
- `deploy/backup/backup.sh`
- `deploy/backup/Dockerfile`
- `compose.yml`
- `docs/PRODUCTION_RUNBOOK.md`

- [x] 创建仅含脱敏字段的临时数据并记录各表数量。
- [x] 执行真实 `pg_dump`，确认输出经过加密后才进入持久目录。
- [x] 确认退出路径会删除明文 dump 临时文件。
- [x] 在全新隔离数据库解密并恢复，禁止覆盖当前开发数据库。
- [x] 只对比表名、migration 和记录计数，不输出正文。
- [x] 验证完成后删除隔离数据库、明文文件、临时密钥和测试数据。

**通过标准：** 加密备份可恢复、记录计数一致、无明文残留、开发数据库未被覆盖。

### Task 7：真实发布与回滚演练

**负责角色：** Execution Agent 自检，随后 Acceptance Agent 独立重跑

**检查文件：**
- `deploy/deploy.sh`
- `tests/deploy/deploy-rollback.test.ts`
- `.github/workflows/deploy.yml`

- [x] 使用本地镜像标签完成一次成功发布。
- [x] 注入 Worker 副本异常，确认恢复上一版本并重新验证 Web 与唯一 Worker。
- [x] 注入 Web 健康失败，确认恢复上一版本。
- [x] 模拟首次部署失败且没有旧版本，确认未验证的 Web 和 Worker 被安全停止。
- [x] 模拟回滚后仍失败，必须返回失败状态，不能更新成功标签。
- [x] 报告只记录短镜像标签，不记录仓库凭证。

**通过标准：** 所有失败路径都有确定结果；失败发布不会覆盖最后成功版本。

### Task 8：安全扫描与基础负载

**负责角色：** Acceptance Agent

**检查文件：**
- `tests/load/k6-smoke.js`
- `.github/workflows/security.yml`
- `docs/SECURITY_INCIDENT_RESPONSE.md`

- [x] 在本地 Compose 环境运行 10 个并发用户基础负载，Worker 并发保持 2。
- [x] 记录成功率、5xx 数、队列峰值和响应时间摘要，不记录请求正文。
- [x] 运行 OWASP ZAP 基线扫描，检查登录、注册、后台和 API 安全头。
- [x] 运行依赖审计和敏感信息扫描；high/critical 必须为 0。
- [ ] 验证 CSP、HSTS、禁止 iframe、MIME 防嗅探和 Referrer Policy。
- [x] 验证 Provider 紧急关闭开关可阻止新的外部调用。

**通过标准：** 无 high/critical 安全问题；无未解释的 5xx；安全头和止损开关有效。

### Task 9：独立验收与文档收口

**负责角色：** Acceptance Agent

- [ ] 从干净进程状态开始，不依赖执行 Agent 遗留的容器或测试输出。
- [ ] 启动 PostgreSQL 后运行 `npm test`，必须 88/88 或更多且 0 失败、0 跳过。
- [ ] 运行 `npm run lint`、`npm run typecheck`、`npm run build`、`npx prisma validate`，全部退出码为 0。
- [ ] 独立执行 Task 1、4、5、6、7、8 的关键场景。
- [ ] 对照本计划逐项给出 `PASS` 或 `FAIL`；没有证据的项目按 `FAIL` 处理。
- [ ] 创建 `docs/P1-19-ACCEPTANCE-REPORT.md`，记录验收日期、环境、结果和未完成项。
- [ ] 更新 `docs/STAGING_RUNTIME_HANDOFF.md`，删除过期接手指令和互相矛盾的状态。
- [ ] 追加 `project-team/work-log.md`。

**整体验收门槛：** 任一必测项失败，P1-19 状态为 `ACCEPTANCE_FAILED`，退回执行 Agent；不得用“基本通过”“有条件通过”进入云部署。

### Task 10：进入香港 staging 的条件

只有 Task 9 判定 `ACCEPTED` 后才能开始：

- [ ] 创建 GitHub 私有仓库，建立并保护 `staging`、`main` 分支。
- [ ] 验证 GHCR 只读拉取凭证；不得使用本地匿名 Docker 配置代替。
- [ ] 开通腾讯云香港轻量服务器、EdgeOne 和 COS。
- [ ] 配置非 root 运维账号、SSH 密钥登录、运维 IP 限制和服务器防火墙。
- [ ] 在 staging 使用全新 PostgreSQL 初始化，不导入本地账号或任务。
- [ ] Provider 继续保持 blocked，先完成后台、备份、告警和 EdgeOne 绕过检查。
- [ ] staging 验收通过后，再由用户决定正式域名和开放真实账号的时间。

## 4. 其他 Agent 常见错误与处理

| 风险 | 必须处理方式 |
|---|---|
| 把自检写成验收通过 | 执行报告与验收报告分开，验收 Agent 必须独立运行命令 |
| 擅自取消 Worker 恢复 | 直接判定返修，除非用户明确修改原计划 |
| 测试数据库没启动导致 seed 失败 | 报告为环境失败；启动并迁移 PostgreSQL 后重跑，不能跳过 |
| 只写单元测试，未做进程重启 | 不满足 RUNTIME-003，必须真实停止和重启 Worker |
| 把容器 running 当 healthy | 增加功能性任务探针，并区分 running/healthy/functional |
| 修改 Docker Desktop 全局配置 | 立即停止；只能使用临时配置且不得用于 GHCR |
| 构建时修改 lockfile或升级依赖 | 判定构建不可复现，退回修正 |
| 使用真实 Provider 验收 | 立即停止并检查费用与日志，演练必须 blocked |
| 把测试密码写进生产环境 | 删除测试环境并重新生成临时秘密；不得提交 Git |
| 输出完整链接或正文 | 视为安全事件，停止任务并按事件清单处理 |
| 清理或覆盖用户已有文件 | 停止工作，列出受影响文件，等待用户决定 |
| 没有 Git 基线继续大改 | 先完成 Task 0，否则不能接受后续交付 |
| 文档同时写“完成”和“待修复” | 验收失败，统一唯一事实状态后再交接 |

## 5. Agent 交付模板

```markdown
# P1-19 执行/验收报告

## 身份
- 角色：Execution Agent / Acceptance Agent
- 阶段：Task N
- 状态：BLOCKED / READY_FOR_ACCEPTANCE / ACCEPTANCE_FAILED / ACCEPTED

## 处理范围
- 修改文件：
- 未修改范围：
- 是否改变产品要求：否

## 验证证据
- PostgreSQL 状态：
- 测试：通过数 / 失败数
- lint/typecheck/build/Prisma：
- Docker 服务：
- Worker 重启恢复：
- 备份恢复：
- 回滚：
- 安全与负载：

## 未完成与风险
- 未完成项：
- 阻断原因：
- 是否需要用户决策：

## 安全确认
- 未输出或提交真实 Key、密码、完整链接、媒体 URL、transcript 或生成文案。
- 临时账号、任务、明文备份、恢复库和 provision 文件已清理。
```

## 6. 当前接手点

1. 当前阶段是 `P1-19 返修待执行`，不是验收通过。
2. 先执行 Task 0，建立可审计基线。
3. 然后执行 Task 1，真实复现并修复 Worker 重启恢复。
4. Execution Agent 完成 Task 1 至 Task 7 后，只能标记 `READY_FOR_ACCEPTANCE`。
5. 再交独立 Acceptance Agent 执行 Task 8 和 Task 9。
6. P1-19 独立验收通过后，才进入 Task 10 香港 staging。
