# IP HTTP Session Cookie Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复临时公网 IP HTTP staging 中管理员和普通用户登录后因 `Secure` Cookie 未被浏览器保存而闪回登录页的问题，同时保持正式 HTTPS 默认安全。

**Architecture:** 新增一个仅服务端使用的小型 Cookie 配置策略，严格解析 `SESSION_COOKIE_SECURE`。未配置、空值或非法值均保持 `secure=true`；只有显式 `false` 才关闭。正式 Compose 显式传入 `true`，临时 IP HTTP Compose 显式传入 `false`，部署校验按模式拒绝不一致配置；管理员与普通用户的创建、注册及注销统一复用该策略。

**Tech Stack:** Next.js 15、TypeScript、Node test runner、Docker Compose、POSIX shell

---

## 设计原因与边界

- `NODE_ENV=production` 描述构建优化，不描述入口是否为 HTTPS，因此不能独立决定 Cookie 的 `Secure` 属性。
- 显式服务端配置可审计、可由部署模式校验，并避免根据公开 URL 字符串猜测协议。
- 默认安全策略保证变量遗漏、拼写错误和非法值不会静默降低生产安全。
- 本修改只允许经过部署脚本确认的临时 `ip-http` 模式关闭 `Secure`；不为 HTTP 提供传输加密，不改变 CSRF、SameSite、HttpOnly、会话期限或数据库会话机制。
- 配置修改只在重新构建/部署后生效；本任务不连接服务器、不触发部署、不修改账号或生产数据。

## Task 1: 用测试定义统一 Cookie 安全策略

**Files:**
- Create: `lib/auth/session-cookie-policy.ts`
- Create: `tests/auth/session-cookie-policy.test.ts`
- Modify: `tests/auth/logout-routes.test.ts`

- [x] 新增测试，覆盖未配置默认 `true`、`true`、`false`、空值和非法值安全回退为 `true`。
- [x] 新增源码策略测试，要求管理员、普通用户登录/注册/注销均复用共享函数。
- [x] 运行定向测试并确认现有实现因缺少共享策略及 `false` 支持而失败。
- [x] 实现最小纯函数 `shouldUseSecureSessionCookies(value)`，并让两类会话 Cookie 与注销路由统一调用。
- [x] 重跑定向测试，确认通过。

## Task 2: 贯穿部署配置并阻止模式错配

**Files:**
- Modify: `compose.yml`
- Modify: `compose.ip-http.yml`
- Modify: `deploy/validate-env.sh`
- Modify: `tests/deploy/staging-config.test.ts`

- [x] 先增加部署测试：正式 Compose 必须传 `SESSION_COOKIE_SECURE=true`，IP HTTP Compose 必须传 `false`，校验脚本必须按模式要求对应值。
- [x] 运行部署定向测试并确认失败。
- [x] 最小修改两个 Compose 和校验脚本；正式模式拒绝非 `true`，IP HTTP 模式拒绝非 `false`。
- [x] 重跑部署定向测试，确认通过。

## Task 3: 文档、全量验证与提交

**Files:**
- Modify: `.env.example`
- Modify: `docs/BUG_LOG.md`
- Modify: `docs/STAGING_IP_HTTP_MODE.md`
- Modify: `docs/EXECUTION_STATUS.md`
- Modify: `docs/STAGING_RUNTIME_HANDOFF.md`

- [x] 更新配置说明、设计优点、能力边界、安全限制和“重新部署后生效”，包括 `.env.example` 的 `SESSION_COOKIE_SECURE`。
- [x] 运行定向测试、全量测试、lint、typecheck、build 与 shell/Compose 配置检查。
- [ ] 检查 Git diff，只暂存本任务文件，忽略现有无关未跟踪文件。
- [ ] 提交清晰的单一修复提交并推送 `staging`。
