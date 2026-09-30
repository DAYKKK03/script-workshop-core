# 脚本工坊基础版独立验收

## 2026-09-30 桌面交付复验

下文是 `8a78ff9` 初验记录，所列三个源码问题已在本轮修复。验收 Agent 对当前工作树独立运行 `npm test`（400 通过、23 跳过）、`npm run test:desktop`（3 通过）、`npm run typecheck`、`npm run lint`、`npm audit --omit=dev --audit-level=high` 和 `git diff --check`，均通过；生产依赖仅余 qs moderate 告警。随包 PostgreSQL 在本机真实启动，完成注册、项目创建与关闭后重启持久化；Web 与三个 Worker 保持运行，强制 Worker 启动失败会阻止应用报告“运行中”。

**发行验收仍不通过**：以上实跑使用源码目录与本机 Node。实际 macOS `.app` 和 Windows 安装包内的 Electron、系统安全存储、内置二进制尚需分平台首次启动验证；也没有真实外部 Provider Key 联调。只有对应 Release 明确记录包内启动与平台测试后，才能把该平台标为可直接下载使用。

日期：2026-09-29，Asia/Shanghai。验收角色：Acceptance Agent。

## 1. 结论：验收不通过

验收对象仅为 `/Users/douwenkai/Documents/script-workshop-core`，HEAD 与 GitHub `DAYKKK03/script-workshop-core` 的 `main` 均为 `8a78ff94b46089dd2d9763d16010e10ed6d5586a`。未验收、修改原项目。范围为无数字人拆分、README 可运行性、保留模块权限与依赖、自动化检查及可执行的本机烟测。

源码能安装、编译并启动页面，不能解释为“下载即可直接使用所有功能”。需要配置 Node.js、PostgreSQL、会话参数和邀请码，启动 Web 与三个 Worker；真实生成还依赖外部 Provider。当前存在 Schema/迁移一致性及生产依赖安全审计门禁失败，数据库真实业务验收又受本机环境阻塞，尚不能签收为完整可用版本。

已阅读 AGENTS.md、README.md、CORE_EDITION_VERIFICATION.md、ENVIRONMENT.md、EXECUTION_STATUS.md、BUG_LOG.md、TEST_PLAN.md、近期工作日志、基础版拆分设计及相关代码。历史状态文档不作为本版本实测成功证据。

## 2. 验证命令及结果

所有本机命令在验收对象目录运行。临时数据库地址故意指向未使用的本机端口，不使用旧项目数据库；临时会话参数仅为此次公开测试值，不是实际凭据。没有读取或写入实际 `.env` / `.env.local`。

| 命令 | 结果 |
| --- | --- |
| `git rev-parse HEAD` | 退出 0：`8a78ff94b46089dd2d9763d16010e10ed6d5586a` |
| `git ls-remote origin refs/heads/main` | 退出 0，同一 SHA |
| `node --version` / `npm --version` | `v24.13.1` / `11.8.0`；本机版本与 README 指定 Node.js 22 不同，未冒称已本机验证 Node.js 22 |
| `npm ci` | 退出 0：`added 533 packages, and audited 534 packages in 23s`；同时提示依赖告警，详见下面生产依赖审计 |
| `npm test` | 退出 0：`tests 423`, `pass 400`, `fail 0`, `skipped 23`, `duration_ms 43576.193334` |
| `npm run typecheck` | 退出 0，无类型错误 |
| `npm run lint` | 退出 0，无 Lint 错误 |
| `DATABASE_URL='postgresql://acceptance:acceptance@127.0.0.1:55439/core_acceptance' npx prisma validate` | 退出 0：`The schema at prisma/schema.prisma is valid` |
| `DATABASE_URL='postgresql://acceptance:acceptance@127.0.0.1:55439/core_acceptance' npx prisma generate` | 退出 0：`Generated Prisma Client (v6.19.3)` |
| `npm run build` | 退出 0：`Compiled successfully`，`Generating static pages (43/43)`；四板块页面及相关 API 均生成 |
| `git diff --check` | 退出 0 |
| `docker info --format '{{.ServerVersion}}'` | 退出 1：Docker daemon 不可用，见下方原始错误 |
| `DATABASE_URL='postgresql://acceptance:acceptance@127.0.0.1:55439/core_acceptance?connect_timeout=2' npm run worker:topics:check` | 退出 1：`Topic Worker startup or runtime check failed`；数据库环境阻塞 |
| `DATABASE_URL='postgresql://acceptance:acceptance@127.0.0.1:55439/core_acceptance?connect_timeout=2' npm run worker:custom-scripts:check` | 退出 1：`Custom Script Worker startup or runtime check failed`；数据库环境阻塞 |
| `npm audit --omit=dev --audit-level=high` | 退出 1：`3 vulnerabilities (1 moderate, 1 high, 1 critical)` |

Docker 原始关键输出：

```text
failed to connect to the docker API at unix:///Users/douwenkai/.docker/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /Users/douwenkai/.docker/run/docker.sock: connect: no such file or directory
```

本机 PATH 未发现 `postgres`、`initdb`、`pg_ctl` 或 `psql`。因此没有执行本机迁移、seed、注册登录、项目 CRUD、跨账号访问和 Worker 数据库消费实测。23 项跳过包括 `TEST_DATABASE_URL is required` 等环境门禁；不能算通过。

生产依赖审计原始关键输出：

```text
next  9.5.6-canary.0 - 15.5.23 || 15.6.0-canary.0 - 16.3.0-preview.10
Severity: critical
Next.js: Unauthenticated Remote Code Execution on windows-hosted servers - https://github.com/advisories/GHSA-p293-qw3h-jr36
Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used - https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
Depends on vulnerable versions of sharp

qs  2.2.5 - 6.15.3
Severity: moderate
qs array-limit bypass via bracket-key comma parsing - https://github.com/advisories/GHSA-x5fp-wj9c-mxmx
qs: Denial of Service via Attacker Controlled isBuffer - https://github.com/advisories/GHSA-4mjr-xmp4-gh2g

sharp  <0.35.4
Severity: high
sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545 - https://github.com/advisories/GHSA-rgj7-g3m4-5g8c

3 vulnerabilities (1 moderate, 1 high, 1 critical)
```

GitHub CI 证据由主 Agent 独立读取并传回，未重复调用 CI。运行 [36586154261](https://github.com/DAYKKK03/script-workshop-core/actions/runs/36586154261) 的基础迁移成功，随后命令失败：

```sh
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

```text
[*] Changed the `TopicGenerationJob` table
  [-] Removed index on columns (status, runDeadlineAt)
Process completed with exit code 2.
```

后续 CI 数据库测试、Worker checks、build、audit 未执行，不能宣称 CI 通过。验收 Agent 独立核对了对应模型和迁移文件，确认该差异存在。

### 本机 HTTP 烟测

执行命令：

```sh
DATABASE_URL='postgresql://acceptance:acceptance@127.0.0.1:55439/core_acceptance' SESSION_SECRET='local-acceptance-only-32-character-secret' SESSION_COOKIE_SECURE=false APP_ORIGIN=http://127.0.0.1:33179 NEXT_PUBLIC_APP_URL=http://127.0.0.1:33179 DOUYIN_PROVIDER=blocked npm run start -- --hostname 127.0.0.1 --port 33179
```

输出 `Ready in 185ms`。Next.js 同时提示 standalone 构建推荐 `node .next/standalone/server.js`；此次 `next start` 已实际响应请求，不将此警告单独当启动失败。

使用 Node.js `fetch`（`redirect: 'manual'`）请求本机服务；POST 使用同源 `Origin` 和 `{}` JSON。结果：

| 路径 | 结果 |
| --- | --- |
| `/`、`/login`、`/register` | HTTP 200 |
| `/dashboard` | HTTP 307 → `/generate`，继而 `/login` |
| `/projects`、`/projects/new`、`/projects/acceptance/edit`、`/generate`、`/topics`、`/custom-scripts` | HTTP 307 → `/login` |
| `/custom-scripts/preview`、`/digital-human` | HTTP 404 |
| GET `/api/projects`、`/api/topics/generate/active`、`/api/scripts/generate-custom/current`、`/api/auth/me` | HTTP 401 |
| POST `/api/projects`、`/api/douyin/extraction-jobs`、`/api/scripts/analyze-reference`、`/api/scripts/generate-final`、`/api/topics/analyze`、`/api/topics/generate`、`/api/scripts/generate-custom` | HTTP 401，统一 `UNAUTHENTICATED` / `请先登录` |

烟测只证明未登录拦截及公开页可服务，不代表登录后生成、复制或视觉验收。服务已停止，本机端口 33179 已关闭。

### 拆分与权限静态检查

- `app`、`components`、`lib`、`worker`、`prisma`、`scripts`、部署配置及环境模板未发现数字人、克隆、对口型相关运行代码命中；构建无数字人路由，模型和五个剩余业务迁移无数字人专用表。
- 火山 ASR、媒体中转、COS 提取依赖仍保留，相关 fixture 测试通过；没有新增手动 transcript 或音视频上传兜底。
- 导航保留项目、参考脚本生成、选题、定制脚本；三个 Worker 入口都加载 `dotenv/config`。安装脚本与 README 所列脚本一致。
- `getProjectForUser` 按 `id + userId` 读取；项目删除按 `id + userId` 原子过滤；选题、定制脚本任务查询包含用户过滤，生成任务重新读取项目资料。对应单元/静态测试通过，不替代真实数据库权限验收。
- README 与 ENVIRONMENT.md 已说明数据库、Origin、会话 Cookie、自定义邀请码和外部服务要求。`.env.example` 未列 `SEED_INVITE_CODES`，但文档要求自行添加，属于使用说明细节，不单独认定启动故障。

## 3. 问题清单

1. **P1：迁移与 Schema 的 TopicGenerationJob 索引不一致。** 位置：`prisma/schema.prisma:131-135`，`prisma/migrations/20260711000300_add_topic_job_recovery/migration.sql:13-14`。迁移创建 `(status, runDeadlineAt)` 索引，模型未声明。新库迁移本身成功，但 CI schema diff 退出 2，阻止后续门禁。建议在模型中补充匹配的 `@@index([status, runDeadlineAt])`，保留已存在迁移，再在空白数据库复跑迁移、diff 和完整 CI。根据主 Agent 对源提交的溯源，这是继承问题，不能归因为数字人拆分删除了索引。

2. **P1：生产依赖审计失败。** 位置：`package.json` 的 Next.js 依赖、sharp override 及 `package-lock.json`。实跑 `npm audit --omit=dev --audit-level=high` 退出 1，涉及 Next.js critical、sharp high、qs moderate。建议执行 Agent 核对适用平台/功能，升级到修复版本、更新锁文件并复跑构建、测试、审计。此次只确认告警和门禁失败，未进行攻击验证，也未断言所有告警在当前 Mac/Linux 部署中均可利用。CI 的同名 audit 门禁位于 Schema 检查之后，此前尚未执行到。

3. **P2：小屏公共导航不能展开。** 位置：`components/app-shell.tsx:44`、`:91-93`。这是静态代码发现：四板块导航位于 `hidden ... lg:flex` 的侧栏中，小屏隐藏；顶部 Menu 图标包在没有点击事件的 `span` 内，组件没有可打开菜单的状态或替代公共导航。影响手机用户通过公共导航切换板块及退出登录。建议使用可访问的按钮和移动菜单，覆盖四个入口及退出，并在小屏登录态实测。本轮未执行浏览器登录后的点击复现，不能写成已实点复现。

未发现需作为 P0 报告的已实证问题。

## 4. 残余风险与阻塞项

- **环境阻塞**：本机 Docker daemon 不可用、无可用 PostgreSQL 服务，未独立完成空库迁移、seed、注册登录、项目 CRUD、用户归属、持久化和 Worker 消费。数据库测试与 CI 后续门禁均须补跑。
- **未验证**：未按 README 用 Node.js 22 从新下载目录完整走 `npm run dev`、注册、四板块操作。已验证的是相同 SHA、独立 `npm ci`、本机 Node.js 24 编译与生产 HTTP 烟测。
- **外部能力未验证**：没有启用或调用 TikHub、DeepSeek、火山 ASR、COS 等实际服务；默认 blocked/空密钥时不能提供真实提取和生成。
- **未验证**：登录态桌面/手机视觉、点击复制、真实选题质量及定制脚本质量。历史真实联调记录不能替代基础版此轮验收。
- **边界**：本轮没有修改业务实现，没有提交、推送或部署，没有修改原项目。仅新增本报告、追加工作日志；依赖、Prisma 和构建生成物留作正常开发缓存，没有遗留临时服务或配置文件。

## 5. 项目现状摘要

无数字人基础版已经作为独立私有 GitHub 仓库存档，保留四板块、账号权限、必要后台、三个异步 Worker、提取转写和中转能力。源码和大部分隔离测试可通过；本机页面与未登录权限烟测通过。

当前难点不是数字人模块残留，而是尚未完成下载后的数据库业务验收，且新 CI 一致性门禁和生产依赖审计已有失败。下一轮应由执行 Agent 修复上述问题，准备独立 PostgreSQL 后补齐 Node.js 22 与数据库/Worker/登录态验证。真实外部服务验收及专用本机 Compose 属于后续工作。
