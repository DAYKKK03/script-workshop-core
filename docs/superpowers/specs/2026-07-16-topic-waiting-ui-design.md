# Topic Waiting UI Simplification Design

## Goal

Remove the visible elapsed-time counter from the authenticated topic-generation page and make cancellation a cancel-only action. The async topic job, polling, recovery, deadline, quota, and backend cancellation contract remain unchanged.

This is the first of two separate phases:

1. Simplify the waiting and cancellation UI.
2. After the UI change is complete, diagnose intermittent 25-topic generation failures from sanitized staging job evidence.

## Design Rationale

The current banner exposes a second-by-second elapsed timer and a button labeled `取消当前任务并重新生成`. The button aborts polling, cancels the current job, and immediately creates another job. This couples two user decisions and can create another provider call when the user only intended to stop.

The elapsed timer does not control the five-minute polling deadline or any backend timeout. Removing it therefore reduces perceived waiting pressure without weakening runtime safety.

## User Experience

While a topic job is active, the existing status banner remains visible:

- Queued: `任务正在排队，请稍候`
- Processing: `正在生成25个选题，请稍候`
- Action: `取消当前任务`
- While the DELETE request is in flight: `取消中...`

The page no longer displays seconds or minutes.

After a successful cancellation:

- polling stops;
- the active-job banner disappears;
- the normal `生成25个选题` action becomes available;
- no new topic job is created automatically.

If cancellation fails, the existing job remains active and polling continues. The page shows `任务取消失败，当前任务仍在处理中` and does not unlock a second generation action.

## State and Data Flow

The workbench removes `elapsedSeconds`, its one-second interval effect, and `formatElapsed`.

A local `canceling` boolean prevents duplicate cancellation requests and disables the cancellation button while the request is pending.

The cancel-only flow is:

```text
active job
-> user clicks cancel
-> DELETE /api/topics/generate/:jobId
-> success: invalidate local polling run, abort poll controller, clear active job and busy state
-> failure: keep the active job and polling state, show a safe error
```

Polling is not aborted before the DELETE request succeeds. This prevents a failed cancellation request from leaving an active backend job without frontend polling.

The existing conditional backend transition remains authoritative. If the Worker completes first, the DELETE request may return `TOPIC_JOB_ALREADY_COMPLETED`; polling is allowed to obtain and display the completed result.

## Files

- `components/topics/topic-ideas-workbench.tsx`
  - remove elapsed-time state and interval;
  - replace cancel-and-regenerate with cancel-only behavior;
  - add a cancellation-pending state and fixed status copy.
- `tests/ui/topics-page.test.ts`
  - assert that elapsed-time UI and auto-regeneration are absent;
  - assert cancel-only DELETE behavior and pending-state copy.
- `docs/TOPIC_IDEAS_DESIGN_SPEC.md`
  - replace the old elapsed-time and cancel-and-regenerate contract.
- `MEMORY.md`
  - record the durable cancel-only topic UI decision after implementation verification.

No API route, database schema, Worker, provider, quota, timeout, or deployment configuration changes are required.

## Design Benefits

- A stop action does only one thing.
- Cancellation cannot silently start another provider call.
- Removing a cosmetic one-second timer reduces unnecessary React updates.
- Backend recovery and bounded polling remain intact.
- The reliability investigation stays evidence-driven and isolated from the UI change.

## Capability Boundary

This change controls only the topic-generation waiting banner and cancellation interaction. It preserves active-job recovery after refresh, five-minute client polling, backend deadlines, idempotency, and success-only quota charging.

## Limitations

This change does not improve DeepSeek output validity or make all 25-topic generations succeed. Intermittent generation failure remains a separate diagnostic task. That task must use sanitized failure categories such as batch index, parser reason, finish reason, response-length bucket, and retry outcome rather than assumptions or raw provider content.

## Acceptance Criteria

1. No elapsed seconds or minutes appear while generating topics.
2. The active-job banner still distinguishes queued and processing states.
3. The only active-job action is `取消当前任务`.
4. Clicking cancel sends one DELETE request and never calls topic generation automatically.
5. Duplicate cancel clicks are prevented while cancellation is pending.
6. Successful cancellation returns the page to manual generation.
7. Failed cancellation keeps the original job active and polling.
8. Refresh recovery, poll timeout, backend deadline, quota, and job ownership behavior remain unchanged.
9. Focused UI tests, full tests, typecheck, lint, and production build pass.

## Verification Strategy

- Update the focused source-contract UI test for the new copy and absence of timer/auto-regeneration.
- Run topic-focused tests first.
- Run the full automated suite, TypeScript check, ESLint, and production build.
- Perform static review of queued, processing, canceling, cancellation-success, and cancellation-failure states.
- Do not call DeepSeek for this UI-only phase.
