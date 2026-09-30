# Production Dependency Security Upgrade Implementation Plan

> **For agentic workers:** Implement only after this plan is approved; keep the execution, acceptance, and Bug-audit gates separate.

**Goal:** Clear the production `npm audit --omit=dev --audit-level=high` gate without a Next.js major upgrade or application-behavior change.

**Architecture:** Update the Next.js 15.5 maintenance patch and the smallest related production dependency overrides. Regenerate the npm lockfile with normal npm resolution, then prove the Node, PostgreSQL Worker, and Linux Docker paths still work. Never use `npm audit fix`.

**Tech Stack:** Next.js 15.5, React 19.1, npm lockfile v3, Sharp native module, Node 22 Alpine, Prisma/PostgreSQL.

## Global Constraints

- Resolve `next` and `eslint-config-next` to `15.5.23`; do not upgrade to Next.js 16.
- Override `next > postcss` to `8.5.26` and leave `nanoid` transitive; it must resolve to at least `3.3.17`.
- Override `sharp` to `0.35.3`; treat it as a native-module compatibility change.
- Do not change application behavior, Workers, Provider code, schema, migrations, quota/retry logic, or GitHub workflows.
- Do not read or expose credentials, run `npm audit fix`, push staging, or deploy during implementation.

### Task 1: Establish baseline

**Files:** Read `package.json`, `package-lock.json`, and `docs/SECURITY.md`.

- [ ] Run `npm ci`.
- [ ] Run `npm audit --omit=dev --audit-level=high` and record the expected red production audit baseline.
- [ ] Run `npm ls next eslint-config-next postcss nanoid sharp --all` and record the resolved graph.

### Task 2: Apply narrow dependency patch

**Files:** Modify `package.json` and regenerate `package-lock.json`.

- [ ] Set `dependencies.next` to `^15.5.23`.
- [ ] Set `devDependencies.eslint-config-next` to `^15.5.23`.
- [ ] Change the nested `overrides.next.postcss` value to `8.5.26`.
- [ ] Add the top-level override `sharp: 0.35.3`; do not add nanoid directly.
- [ ] Run `npm install --package-lock-only`, then `npm ci`.
- [ ] Run `npm ls next eslint-config-next postcss nanoid sharp --all`; reject invalid entries or unrelated dependency drift.
- [ ] Run `npm audit --omit=dev --audit-level=high`; expected result is exit code 0 with no high/critical production finding.

### Task 3: Update security documentation

**Files:** Modify `docs/SECURITY.md`.

- [ ] Replace stale references to Next `15.5.19` and PostCSS `8.5.10` with the approved resolved versions.
- [ ] State that sharp `0.35.3` is an explicit native-module override and requires Docker Linux verification.
- [ ] State that overrides can only be removed after an upstream Next.js release resolves fixed versions and the same audit/build/staging checks pass.

### Task 4: Validate all affected runtime boundaries

**Files:** Test existing suite and `Dockerfile`; add a regression test only if a real compatibility failure requires one.

- [ ] Sequentially run `npm test`, `npm run worker:topics:check`, `npm run worker:custom-scripts:check`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npx prisma validate` against existing isolated test configuration.
- [ ] Run `docker build -t douyin-script-security-upgrade:local .` to verify sharp on Node 22 Alpine.
- [ ] Run a bounded local container smoke test with build-safe placeholders and isolated data only. Confirm the web process starts, a read-only health route responds, and `/_next/image` does not crash. Do not make Provider calls or use real user sessions.
- [ ] Run `git diff --check` and verify only `package.json`, `package-lock.json`, `docs/SECURITY.md`, plus any narrowly justified regression test changed.

### Task 5: Commit and hand off

**Files:** Commit only Task 2–4 changes.

- [ ] Commit with `chore: patch production dependency vulnerabilities`.
- [ ] Hand off to Acceptance Agent for an independent audit, graph, isolated tests, Workers, build, Docker build, and smoke verification.
- [ ] Hand off to Bug Agent to verify no Next 16 upgrade, no direct nanoid dependency, no production environment weakening, and no high/critical production audit finding.
- [ ] Only after both pass, push the accepted SHA to `staging`. GitHub CI must pass its audit, tests, Workers, build, image, and deploy checks before confirming staging deployment.

## Acceptance Criteria

- Production audit exits 0 with zero high/critical findings.
- Resolved dependency graph contains the approved versions and no invalid packages.
- Existing tests, Workers, typecheck, lint, build, Prisma validation, Docker build, and bounded container smoke all pass.
- No source, Provider, schema/migration, quota/retry, or workflow behavior changes exist.
