# Extraction Worker Fresh Tick Deployment Gate Implementation Plan

**Goal:** Replace the staging deploy blocker that creates a shared-queue probe with a bounded check for a fresh, sanitized tick from the newly started Extraction Worker container.

**Architecture:** `deploy/deploy.sh` will retain web/database health and single-replica checks. After Compose starts the release, it will bind verification to the exact running worker container ID and its start timestamp, then inspect only that container's post-start logs for `douyin_extraction_worker_tick`. It never prints the container log; failure uses the existing fixed `extraction_worker_functional_failed:<allowlist-code>` form and follows the existing rollback path.

**Constraints:** Do not modify Extraction queue semantics, Provider behavior, schema/migrations, or user-facing features. No real Provider calls, deployment, push, or environment-file access. The isolated PostgreSQL `worker-functional.test.ts` remains the code-path proof for claim-to-`EXTRACTION_SOURCE_EXPIRED`.

## Files

- Modify `deploy/deploy.sh`: replace the shared-queue terminal probe with a new-container tick gate.
- Modify `tests/deploy/deploy-rollback.test.ts`: exercise fresh tick, old/missing tick, restart, database-health failure, fail-fast, and rollback verification with the shell-level fake Docker boundary.
- Modify `tests/deploy/staging-config.test.ts`: assert the release gate retains health/single-worker checks but no longer invokes the shared-queue command.
- Modify `docs/DEPLOYMENT_CHECKLIST.md` and `docs/PRODUCTION_RUNBOOK.md`: define the evidence and its limits.
- Modify `MEMORY.md`: record the long-lived staging gate boundary.

## Acceptance Criteria

1. A busy queue or slow retention cannot block a release merely because a synthetic job misses its terminal state.
2. Only a tick from the exact worker container instance, emitted after that instance started in the release, passes; a prior-instance tick cannot pass.
3. Missing tick, restarted worker, and database health failure fail closed, use a fixed sanitized category, and preserve fail-fast rollback.
4. The deploy script never writes raw container logs, task URLs, user data, or database details to stdout/stderr.
5. Isolated PostgreSQL functional-probe coverage remains in place as the separate claim/terminal code-path test.

## Verification Order

1. Add failing shell/static tests for the new contract and confirm they fail against the current shared-queue verifier.
2. Make the minimal deploy-script change and confirm focused tests pass.
3. Run deploy tests, the existing isolated `worker-functional.test.ts` when its test database is available, typecheck, lint, build, and shell/static deployment checks.
