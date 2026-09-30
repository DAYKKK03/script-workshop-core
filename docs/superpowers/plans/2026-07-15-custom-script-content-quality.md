# Custom Script Content Quality Implementation Plan

> **For agentic workers:** Implement task-by-task with tests before production code. Do not call a real AI provider.

**Goal:** Make custom scripts longer and more informative while preserving the working generation chain through a safe short-result fallback.

**Architecture:** Strengthen the existing compact prompt rather than attach the full writing manual. Persist a strict internal `quality_fallback` in `CustomScriptGenerationJob.result` before the optional rewrite, hide it from processing APIs, and let stale Workers recover it without a migration.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, existing DeepSeek provider abstraction, Node test runner.

## Global Constraints

- No new dependency, database field, or migration.
- No real DeepSeek request, staging runtime test, or production deployment.
- Keep the service's internal safety range at 80—350 code points.
- Keep the prompt target at 240—300 and product copy at approximately 200—350.
- General knowledge cannot become a merchant-specific fact or a medical diagnosis, treatment, prescription, guarantee, exact standard, or unsupported number.
- A failed enrichment attempt must never discard a first safe draft.
- Successful generation charges the shared script quota exactly once.
- The optional call uses a 40-second total reserve for the 30-second lease recovery window, Worker polling, database margin, and a 5-second success transaction inside the existing 120-second deadline.
- Explicit diagnosis is evaluated by whole-sentence meaning. Unsupported high-risk merchant assertions require a trusted project name/brand or fixed merchant subject plus a capability assertion verb and high-risk fact.

---

### Task 1: Document the revised writing and fact boundary

**Files:**
- Modify: `docs/CUSTOM_SCRIPT_WRITING_RULES.md`
- Modify: `docs/CUSTOM_SCRIPT_DESIGN_SPEC.md`
- Modify: `MEMORY.md`
- Test: `tests/docs/custom-script-contract.test.ts`

**Interfaces:**
- Produces the single written contract used by Prompt, Worker, and acceptance tests.

- [ ] Add failing documentation assertions for bounded general industry knowledge, value-first output, the 80—199 soft enrichment path, and safe fallback.
- [ ] Update the two custom-script documents without contradicting the existing 80—350 service range.
- [ ] Record the durable decision in `MEMORY.md` without secrets or runtime content.
- [ ] Run `npx tsx --test tests/docs/custom-script-contract.test.ts` and confirm it passes.

### Task 2: Strengthen the compact runtime prompt

**Files:**
- Modify: `lib/custom-scripts/prompt.ts`
- Test: `tests/custom-scripts/service-runtime.test.ts`

**Interfaces:**
- Consumes `CustomScriptRepair` from the contracts module.
- Produces `buildCustomScriptMessages()` with bounded knowledge, objective blueprints, compact bad/good contrast, and a `quality_enrichment` repair instruction.

- [ ] Add failing prompt assertions covering permission and prohibition boundaries.
- [ ] Add objective-specific value structures and require at least two useful knowledge elements.
- [ ] Add a short de-identified bad/good comparison with no reusable merchant facts or exact numbers.
- [ ] Add a fresh enrichment instruction that does not include the previous generated body.
- [ ] Run `npx tsx --test tests/custom-scripts/service-runtime.test.ts` and confirm it passes.

### Task 3: Add soft quality enrichment with fallback

**Files:**
- Modify: `lib/custom-scripts/length-repair.ts`
- Modify: `lib/custom-scripts/service-runtime.ts`
- Modify: `lib/custom-scripts/job-runner.ts`
- Modify: `lib/custom-scripts/jobs.ts`
- Modify: `lib/custom-scripts/worker.ts`
- Modify: `lib/custom-scripts/job-policy.ts`
- Test: `tests/custom-scripts/service-runtime.test.ts`
- Test: `tests/custom-scripts/integration.test.ts`

**Interfaces:**
- Extend `CustomScriptRepair` with `{ reason: "quality_enrichment" }`.
- Expose a pure helper that decides whether a safe result is below the 200-character product target.
- Store a strict internal `quality_fallback` in `CustomScriptGenerationJob.result`; public serialization must ignore it while status is `processing`.

- [ ] Write failing tests for one-call completion at 200+, enrichment at 80—199, longer-result selection, invalid/provider failure fallback, and `needs_profile` fallback.
- [ ] Implement the smallest pure length-quality helper without changing hard validation.
- [ ] Teach the Worker to reserve the second provider call only for the soft enrichment path.
- [ ] Persist and revalidate the fallback before the second reservation; recover crash points before and after that reservation.
- [ ] Keep stale exhausted tasks with a valid fallback claimable; fail old exhausted tasks without one exactly as before.
- [ ] Reserve a 30-second lease recovery window and a 5-second success transaction before any quality call.
- [ ] When enrichment is unavailable or worse, complete the durable fallback through the existing transactional success path.
- [ ] Confirm no job input, result schema, quota transaction, lease logic, or provider-call limit is bypassed.
- [ ] Run the focused service and integration tests.

### Task 4: Add narrow semantic safety checks

**Files:**
- Modify: `lib/custom-scripts/contracts.ts`
- Test: `tests/custom-scripts/contracts.test.ts`

- [ ] Reject explicit diagnosis phrasing for named conditions while allowing uncertainty language and advice to consult a doctor.
- [ ] Reject unsupported first-person merchant claims about imported products, patents, certifications, qualifications, doctors/experts, or specific equipment.
- [ ] Accept the same merchant claim when the latest profile explicitly supports the high-risk phrase.
- [ ] Keep ordinary low-risk general industry knowledge unaffected.

### Task 5: Complete local regression gates

**Files:**
- Modify only files required by failures caused by this feature.

**Interfaces:**
- Produces a locally verified commit ready for staging deployment in a later round.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --check` and `git status --short`; preserve unrelated user files.
- [ ] Commit the focused change with an English conventional commit message.

## Expected Outcome

The chain continues returning any safe 80—350 script, while short first drafts receive one best-effort chance to become a 200—350 value-first script. Prompt content becomes richer and allows safe general industry knowledge without turning it into claims about the merchant.
