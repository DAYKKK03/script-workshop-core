# P1-17 Deployment Architecture Decision

## Decision Summary

P1-17 selected and implemented the first deployment track:

1. Initial production: Tencent Cloud Hong Kong VPS, PostgreSQL, and a separate database-polling worker.
2. Later scale-out: managed PostgreSQL and a separate worker server when queue pressure requires it.

SQLite and in-process extraction have been removed from the active architecture. Local and production environments now use PostgreSQL; the API only queues jobs and the worker claims them separately.

## Current Technical Reality

Current stack:

- Next.js App Router
- Prisma
- PostgreSQL datasource in `prisma/schema.prisma`
- `ExtractionJob` table for technical runtime state
- Independent Extraction Worker with bounded concurrency, retry, stale-lock recovery, and restart recovery
- External services called server-side only: TikHub, Volcengine/Doubao ASR, DeepSeek

Remaining operational risk:

- The first release is a single-server topology, so server failure affects Web, Worker, and PostgreSQL together.
- DB polling is suitable for the first 50 accounts but is not a substitute for a dedicated queue at larger scale.
- Backup recovery, EdgeOne rules, cloud alerts, and deployment rollback must still be exercised in staging.

## Platform Options

### Option A: Vercel / Serverless

Pros:

- Fast frontend deployment.
- Easy environment variable management.
- Good fit for short request/response APIs and static pages.

Cons:

- Not suitable for long-running ASR polling inside a request handler.
- In-process jobs are unreliable because function instances can stop after the request.
- SQLite is not suitable unless paired with an external persistent database.
- Requires external worker or queue provider for extraction jobs.

Decision:

- Do not use Vercel-only deployment for the current full extraction chain.
- Vercel can be used for the web app only if extraction jobs move to managed PostgreSQL plus external queue/worker.

### Option B: Single VPS / Single Long-Running Server

Pros:

- Fastest path to a working MVP with the current architecture.
- Supports long-running Node process and background worker.
- Easier to run Prisma migration and inspect logs.
- Can temporarily run all services on one machine.

Cons:

- Requires server operations: process manager, backups, firewall, monitoring, deploy scripts.
- Single-instance failure affects availability.
- SQLite can work only with persistent disk and backups, but PostgreSQL is still preferred.

Decision:

- Recommended fastest MVP launch path.
- Use PostgreSQL even on VPS if possible.
- Keep `DOUYIN_PROVIDER=blocked` as rollback switch.

### Option C: Managed App Platform + Managed PostgreSQL + Worker

Examples: Render, Railway, Fly.io, or similar app platforms that support long-running web and worker processes.

Pros:

- Cleaner production shape than pure Serverless.
- Supports separate web and worker processes.
- Managed PostgreSQL reduces persistence risk.
- Easier to evolve to queue-based job processing.

Cons:

- More configuration than a single VPS.
- Platform-specific deployment and environment setup.

Decision:

- Recommended stable production path.
- Prefer a platform that supports one web process and one worker process using the same PostgreSQL database.

## Database Decision

Recommendation:

- Use PostgreSQL for production.
- Use PostgreSQL for local development and production to avoid database-specific behavior differences.

Rationale:

- User accounts, invite codes, merchant projects, and extraction jobs need durable persistence.
- Serverless and managed platforms commonly use ephemeral filesystems.
- PostgreSQL supports safer concurrent access as worker logic matures.

Minimum migration stage:

- The Prisma datasource and initial migration are PostgreSQL-ready.
- Local development uses the Docker PostgreSQL service through `DATABASE_URL`.
- Run `prisma migrate deploy` against a fresh staging database before launch.

## Queue / Worker Decision

### Option 1: Keep Current In-Process Job

Use only for:

- Local development.
- Single-instance internal demo.
- Short controlled tests.

Do not use for:

- Multi-instance deployment.
- Serverless deployment.
- Real customer traffic.

### Option 2: DB Polling Worker

Shape:

- Web API creates `ExtractionJob`.
- Separate worker process polls queued jobs.
- Worker claims one job at a time using status transitions.
- Worker writes only runtime status and short-lived transcript.
- Page continues polling job status.

Pros:

- Minimal dependency increase.
- Works well with PostgreSQL and a long-running worker.
- Good MVP production step.

Cons:

- Needs careful job claim logic to prevent duplicate work.
- Less feature-rich than Redis queue systems.

Decision:

- Recommended next implementation after PostgreSQL.
- Suitable for P1-19.

### Option 3: BullMQ / Redis

Pros:

- Mature queue semantics.
- Retries, delays, backoff, concurrency controls.

Cons:

- Adds Redis dependency and operational complexity.
- More moving parts than needed for first launch.

Decision:

- Defer until DB polling worker proves insufficient or traffic requires richer queue behavior.

### Option 4: Platform Queue

Pros:

- Managed retries and worker execution.
- Good fit if chosen platform provides a reliable queue.

Cons:

- Platform lock-in.
- Requires platform-specific implementation.

Decision:

- Acceptable for stable path if the deployment platform is chosen first.

## Recommended Launch Paths

### Fastest MVP Launch

1. Deploy to a single VPS or single long-running app server.
2. Use PostgreSQL 16 with an encrypted off-server backup.
3. Add a DB polling worker process.
4. Keep web process and worker process on the same server initially.
5. Keep Provider rollback through `DOUYIN_PROVIDER=blocked`.
6. Run manual smoke test before exposing to real users.

### Stable Production Launch

1. Choose managed app platform that supports long-running web and worker processes.
2. Use managed PostgreSQL.
3. Implement DB polling worker or platform queue.
4. Add job claim, retry, timeout, and cleanup semantics.
5. Add monitoring for Provider failure rate, ASR timeout, DeepSeek failure, and queue backlog.
6. Run production-mode browser E2E before launch.

## Required Environment Variables

Base:

- `DATABASE_URL`
- `SESSION_SECRET`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`

DeepSeek:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_API_BASE_URL`
- `DEEPSEEK_MODEL`
- `AI_REQUEST_TIMEOUT_MS`

Douyin Provider:

- `DOUYIN_PROVIDER`
- `TIKHUB_API_KEY`
- `TIKHUB_API_BASE_URL`
- `TIKHUB_REQUEST_TIMEOUT_MS`

Volcengine / Doubao ASR:

- `VOLCENGINE_ASR_API_KEY`
- `VOLCENGINE_ASR_RESOURCE_ID`
- `VOLCENGINE_ASR_SUBMIT_ENDPOINT`
- `VOLCENGINE_ASR_QUERY_ENDPOINT`
- `VOLCENGINE_ASR_MODEL`
- `VOLCENGINE_ASR_REQUEST_TIMEOUT_MS`
- `VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS`
- `VOLCENGINE_ASR_QUERY_INTERVAL_MS`

Extraction jobs:

- `EXTRACTION_JOB_TIMEOUT_MS`
- `EXTRACTION_JOB_TTL_MS`
- Future worker variables:
  - `EXTRACTION_WORKER_ENABLED`
  - `EXTRACTION_WORKER_POLL_INTERVAL_MS`
  - `EXTRACTION_WORKER_CONCURRENCY`
  - `EXTRACTION_JOB_MAX_ATTEMPTS`

## Follow-Up Stages

### P1-18: PostgreSQL Production Database Migration

Goal:

- Make production deployment use PostgreSQL.

Expected work:

- Update Prisma datasource strategy and deployment docs.
- Validate migrations on a PostgreSQL database.
- Keep local development documented.
- Verify auth, projects, and extraction jobs on PostgreSQL.

Acceptance checks:

- Prisma migration status passes on PostgreSQL.
- Auth/project CRUD works.
- Job create/query works.
- No real secrets are committed.

### P1-19: Extraction Worker

Goal:

- Move job processing out of API request lifecycle.

Expected work:

- Add worker entrypoint.
- Add job claiming semantics.
- Prevent duplicate concurrent processing.
- Preserve short-lived transcript behavior from P1-16.
- Keep page polling API unchanged.

Acceptance checks:

- API creates job but does not perform provider work.
- Worker processes queued job.
- Page polling receives succeeded/failed state.
- Restart and retry behavior is documented.

### P1-20: Production Smoke Test and Observability

Goal:

- Validate real production-like flow and operational visibility.

Expected work:

- Add safe status logs with lengths, durations, and error categories only.
- Add smoke-test checklist for login, project, extraction, ASR, DeepSeek, and copy.
- Add rollback checklist.

Acceptance checks:

- No Key, full media URL, full transcript, or full final script in logs.
- Provider failure maps to fixed user-facing error.
- `DOUYIN_PROVIDER=blocked` rollback works.

## Final Decision

Use PostgreSQL for production. For fastest MVP, use a single long-running server plus a DB polling worker. For stable production, use managed app hosting with separate web/worker processes and managed PostgreSQL. Do not rely on SQLite plus in-process jobs for real production traffic.
