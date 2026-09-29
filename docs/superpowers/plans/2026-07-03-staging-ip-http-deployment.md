# 无域名公网 IP 临时 Staging 部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为香港 staging 增加显式、可审计、可回滚的公网 IP / HTTP 临时部署模式，同时保持正式域名/HTTPS/EdgeOne 配置不被削弱。

**Architecture:** 复用现有自托管 Runner 本机部署链路，在 workflow 中新增显式模式选择，在部署脚本中新增环境校验和模式分发，在 Compose/Caddy 层增加临时模式专用文件。正式模式文件保持独立不变，回滚继续走现有 `deploy/deploy.sh`。

**Tech Stack:** GitHub Actions, Docker Compose, Caddy, POSIX shell, Node test runner, Next.js, Prisma

---

### Task 1: 部署模式与环境校验红测

**Files:**
- Modify: `tests/deploy/self-hosted-deploy.test.ts`
- Modify: `tests/deploy/staging-config.test.ts`
- Test: `tests/deploy/self-hosted-deploy.test.ts`
- Test: `tests/deploy/staging-config.test.ts`

- [ ] **Step 1: 写模式选择与环境校验的失败测试**
- [ ] **Step 2: 运行定向测试，确认当前实现缺失这些能力**
- [ ] **Step 3: 只实现通过测试所需的最小部署模式传递和校验脚本入口**
- [ ] **Step 4: 重新运行定向测试，确认转绿**

### Task 2: 临时 Compose/Caddy 模式实现

**Files:**
- Create: `compose.ip-http.yml`
- Create: `deploy/Caddyfile.ip-http`
- Modify: `deploy/self-hosted-deploy.sh`
- Modify: `deploy/deploy.sh`
- Test: `tests/deploy/staging-config.test.ts`

- [ ] **Step 1: 写端口暴露、Provider 固定 blocked、Worker 并发 1 的失败测试**
- [ ] **Step 2: 运行测试，确认当前没有临时模式文件或约束**
- [ ] **Step 3: 增加临时模式 Compose/Caddy，并让部署脚本按模式选择**
- [ ] **Step 4: 重新运行定向测试，确认端口与配置约束通过**

### Task 3: Workflow 显式开关与回滚兼容

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `tests/deploy/self-hosted-deploy.test.ts`
- Test: `tests/deploy/deploy-rollback.test.ts`

- [ ] **Step 1: 写 workflow 显式开关与 staging-only 约束的失败测试**
- [ ] **Step 2: 运行测试，确认当前 workflow 不满足显式模式选择**
- [ ] **Step 3: 最小修改 workflow，把 `ip-http` 作为显式 dispatch 输入并传给部署脚本**
- [ ] **Step 4: 运行自托管部署测试和回滚测试，确认兼容**

### Task 4: 部署文档与能力边界

**Files:**
- Modify: `docs/SELF_HOSTED_DEPLOYMENT.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/DEPLOYMENT_CHECKLIST.md`
- Modify: `docs/STAGING_RUNTIME_HANDOFF.md`
- Modify: `docs/EXECUTION_STATUS.md`
- Modify: `project-team/work-log.md`

- [ ] **Step 1: 更新设计原因、能力边界、环境变量清单和撤销步骤**
- [ ] **Step 2: 明确临时模式不是生产安全方案，正式配置未被削弱**
- [ ] **Step 3: 追加工作日志**

### Task 5: 全量验证、提交与推送

**Files:**
- Modify: `package.json`（仅当需要新增验证命令时）

- [ ] **Step 1: 运行定向测试并确认红绿证据完整**
- [ ] **Step 2: 运行 `npm test`、`npm run lint`、`npm run typecheck`、`npm run build`**
- [ ] **Step 3: 运行 `npx prisma validate`、YAML/shell 语法检查与敏感信息扫描**
- [ ] **Step 4: 审查 diff 后提交到 `staging` 并推送**
