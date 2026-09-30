# Topic Waiting UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the topic-generation elapsed-time display and make the active-job action cancel the current task without automatically starting another generation.

**Architecture:** Keep the existing durable topic job, DELETE endpoint, polling loop, five-minute client deadline, refresh recovery, and quota rules. Change only the client workbench state machine: fixed status copy replaces the timer, and a dedicated cancellation-pending state coordinates a cancel-only DELETE request without stopping polling before cancellation succeeds.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Node test runner, ESLint

## Global Constraints

- Do not change topic API routes, database schema, Worker, DeepSeek prompt, retry policy, quota, or backend timeout.
- Do not call DeepSeek or run a real topic generation during this UI phase.
- Queued copy is exactly `任务正在排队，请稍候`.
- Processing copy is exactly `正在生成25个选题，请稍候`.
- The active action is exactly `取消当前任务`; while pending it is `取消中...`.
- A successful cancellation never creates another topic job automatically.
- A failed cancellation keeps the original job active and polling.
- Preserve unrelated user files and changes.

---

### Task 1: Define the cancel-only UI contract

**Files:**
- Modify: `tests/ui/topics-page.test.ts`

**Interfaces:**
- Consumes: source text from `components/topics/topic-ideas-workbench.tsx`.
- Produces: a focused source-contract test that rejects the elapsed timer and automatic regeneration path.

- [ ] **Step 1: Replace the old waiting UI test with the new contract**

Use this test body:

```ts
test("topics page restores an active job and exposes fixed status with cancel-only behavior", async () => {
  const workbench = await read("components/topics/topic-ideas-workbench.tsx");
  assert.match(workbench, /\/api\/topics\/generate\/active/);
  assert.match(workbench, /resumeJob\(job\)/);
  assert.match(workbench, /任务正在排队，请稍候/);
  assert.match(workbench, /正在生成25个选题，请稍候/);
  assert.match(workbench, /取消当前任务/);
  assert.match(workbench, /取消中\.\.\./);
  assert.match(workbench, /method: "DELETE"/);
  assert.match(workbench, /pollControllerRef\.current\?\.abort\(\)/);
  assert.match(workbench, /TOPIC_JOB_ALREADY_COMPLETED/);
  assert.doesNotMatch(workbench, /elapsedSeconds|formatElapsed|已等待/);
  assert.doesNotMatch(workbench, /cancelAndRegenerate|await generate\(true\)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test tests/ui/topics-page.test.ts
```

Expected: FAIL because the current workbench still contains `elapsedSeconds`, `formatElapsed`, `已等待`, `cancelAndRegenerate`, and `await generate(true)`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/ui/topics-page.test.ts
git commit -m "test: define cancel-only topic waiting UI"
```

### Task 2: Implement fixed status and cancel-only behavior

**Files:**
- Modify: `components/topics/topic-ideas-workbench.tsx`
- Test: `tests/ui/topics-page.test.ts`

**Interfaces:**
- Consumes: existing `activeJob`, `busy`, `pollControllerRef`, `generationRunRef`, and `DELETE /api/topics/generate/:jobId`.
- Produces: `cancelCurrentJob(): Promise<void>` and local `canceling: boolean` state.

- [ ] **Step 1: Remove the elapsed timer**

Delete:

```ts
const [elapsedSeconds, setElapsedSeconds] = useState(0);
```

Delete the `useEffect` that calls `setInterval(update, 1_000)`, and delete:

```ts
function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}
```

- [ ] **Step 2: Add cancellation-pending state**

Add beside the other local state:

```ts
const [canceling, setCanceling] = useState(false);
```

- [ ] **Step 3: Replace cancellation and automatic regeneration**

Replace `cancelAndRegenerate` with:

```ts
async function cancelCurrentJob() {
  if (!activeJob || canceling) return;
  const canceledId = activeJob.id;
  setCanceling(true);
  setError("");
  try {
    await requestJson<ApiResult<{ id: string; status: string }>>(
      `/api/topics/generate/${encodeURIComponent(canceledId)}`,
      { method: "DELETE" },
    );
    generationRunRef.current += 1;
    pollControllerRef.current?.abort();
    pollControllerRef.current = null;
    pollTimedOutRef.current = false;
    setActiveJob(null);
    setBusy(null);
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === "TOPIC_JOB_ALREADY_COMPLETED") return;
    setError("任务取消失败，当前任务仍在处理中");
  } finally {
    setCanceling(false);
  }
}
```

The polling controller is aborted only after DELETE succeeds. A failed DELETE leaves `busy === "generate"`, `activeJob`, and the polling controller unchanged. If the Worker completes before cancellation and DELETE returns `TOPIC_JOB_ALREADY_COMPLETED`, polling remains responsible for displaying the completed result without a misleading cancellation error.

- [ ] **Step 4: Replace active-job banner copy and action**

Render the status as:

```tsx
<span>
  <LoaderCircle className="mr-2 inline animate-spin" size={16} />
  {activeJob.status === "queued"
    ? "任务正在排队，请稍候"
    : "正在生成25个选题，请稍候"}
</span>
<button
  type="button"
  onClick={cancelCurrentJob}
  disabled={canceling}
  className="focus-ring min-h-11 rounded-md border border-[#ffb14a]/40 px-4 font-semibold hover:bg-[#ff7a1a]/15 disabled:cursor-not-allowed disabled:opacity-60"
>
  {canceling ? "取消中..." : "取消当前任务"}
</button>
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
npx tsx --test tests/ui/topics-page.test.ts
```

Expected: all topic page UI tests PASS.

- [ ] **Step 6: Commit the implementation**

```bash
git add components/topics/topic-ideas-workbench.tsx
git commit -m "fix: make topic cancellation explicit"
```

### Task 3: Synchronize product documentation and project memory

**Files:**
- Modify: `docs/TOPIC_IDEAS_DESIGN_SPEC.md`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: the verified UI behavior from Task 2.
- Produces: a durable product contract stating that elapsed time is hidden and cancellation does not regenerate.

- [ ] **Step 1: Update the topic design contract**

Replace the old statement about real elapsed time and `取消当前任务并重新生成` with:

```md
- 页面显示固定的排队或生成状态，不展示已等待秒数或分钟数；活动任务只提供“取消当前任务”。取消成功后回到手动生成状态，不自动创建新任务；取消失败时保留原任务和轮询。刷新或重新进入页面后仍恢复当前用户唯一活动任务及轮询。
```

- [ ] **Step 2: Record the durable decision in MEMORY.md**

Append:

```md
- 2026-07-16 爆款选题等待 UI 不再显示秒级/分钟级已等待时长；排队和处理状态使用固定文案。活动任务按钮只执行“取消当前任务”，成功后由用户手动决定是否重新生成，禁止取消后自动创建新 Job；取消失败必须保留原活动任务和轮询。该 UI 决策不改变5分钟客户端轮询、后端deadline、幂等、额度或失败重试策略。
```

- [ ] **Step 3: Validate documentation consistency**

Run:

```bash
rg -n "真实已等待时长|取消当前任务并重新生成" docs/TOPIC_IDEAS_DESIGN_SPEC.md MEMORY.md
git diff --check
```

Expected: the obsolete phrases do not appear in the active topic design contract, and `git diff --check` exits successfully.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/TOPIC_IDEAS_DESIGN_SPEC.md MEMORY.md
git commit -m "docs: record cancel-only topic generation UI"
```

### Task 4: Run complete verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: evidence that UI, types, lint, tests, and production build remain valid.

- [ ] **Step 1: Run focused topic tests**

```bash
npx tsx --test tests/ui/topics-page.test.ts tests/topics/*.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run the full automated test suite**

```bash
npm test
```

Expected: all tests PASS without a real DeepSeek request.

- [ ] **Step 3: Run typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Expected: both commands exit successfully.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: the Next.js production build succeeds.

- [ ] **Step 5: Review the final diff**

```bash
git diff staging...HEAD --check
git diff --stat staging...HEAD
git status --short
```

Expected: only the approved spec, plan, workbench, focused UI test, topic design spec, and MEMORY.md are tracked changes. Existing unrelated untracked user files remain untouched.
