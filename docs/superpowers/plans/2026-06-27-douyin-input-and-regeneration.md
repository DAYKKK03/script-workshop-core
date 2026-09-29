# Douyin Input And Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept complete Douyin share messages, reuse extracted reference data across project and duration changes, and classify/retry transient provider failures safely.

**Architecture:** Add a client-safe source normalization module shared by the page and extraction service. Keep transcript/reference state bound to the normalized source URL in the page, while project and duration changes invalidate only the final script. Isolate TikHub retry policy in a pure request helper so transient retries and failure categories are testable without exposing provider payloads.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, Node built-in test runner.

---

### Task 1: Add A Minimal Test Runner

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the test command**

Add this script:

```json
"test": "node --experimental-strip-types --test tests/**/*.test.ts"
```

- [ ] **Step 2: Verify the runner starts**

Run: `npm test`

Expected: the command starts successfully; before test files exist it may report no matching tests.

### Task 2: Normalize Bare URLs And Complete Share Messages

**Files:**
- Create: `lib/douyin/source-input.ts`
- Create: `tests/douyin/source-input.test.ts`
- Modify: `lib/douyin/transcript-provider.ts`
- Modify: `lib/douyin/extraction-jobs.ts`

- [ ] **Step 1: Write failing source normalization tests**

Cover these exact cases with `node:test` and `node:assert/strict`:

```ts
assert.equal(extractDouyinUrl("https://v.douyin.com/example/"), "https://v.douyin.com/example/");
assert.equal(
  extractDouyinUrl("复制打开抖音 https://v.douyin.com/example/ 看视频"),
  "https://v.douyin.com/example/"
);
assert.equal(
  extractDouyinUrl("介绍 https://example.com/a 再看 https://www.douyin.com/video/1"),
  "https://www.douyin.com/video/1"
);
assert.equal(extractDouyinUrl("没有抖音链接"), null);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- tests/douyin/source-input.test.ts`

Expected: FAIL because `lib/douyin/source-input.ts` does not exist.

- [ ] **Step 3: Implement the source normalizer**

Export:

```ts
export function isDouyinUrl(value: string): boolean;
export function extractDouyinUrl(value: unknown): string | null;
```

Find HTTP(S) candidates in text order, trim surrounding Chinese/ASCII punctuation, and return the first candidate on `douyin.com`, a Douyin subdomain, `iesdouyin.com`, or an IES Douyin subdomain.

- [ ] **Step 4: Use the shared normalizer at server boundaries**

Remove the duplicate hostname parser from `transcript-provider.ts`, import and re-export the shared function for compatibility, and change `normalizeDouyinUrl()` in `extraction-jobs.ts` to call `extractDouyinUrl()`.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- tests/douyin/source-input.test.ts`

Expected: PASS for bare URL, complete share message, mixed links, and invalid text.

### Task 3: Reuse Reference State Across Generation Input Changes

**Files:**
- Modify: `components/generate/transcript-extract-form.tsx`

- [ ] **Step 1: Establish browser failure evidence**

Verify the current page uses a URL-only input and that a generated script replaces the generate action with the copy action.

Expected: complete share text is browser-invalid and no regenerate action remains after generation.

- [ ] **Step 2: Change source input handling**

Use `type="text"`, import `extractDouyinUrl`, and track `referenceSourceUrl`. When the normalized source changes away from `referenceSourceUrl`, clear transcript, reference structure, final script, and copy feedback. Equivalent raw text containing the same normalized source must retain reference state.

- [ ] **Step 3: Isolate project and duration changes**

Wrap project and duration updates in handlers that clear only `finalScript`, `copyMessage`, and generation errors. Do not clear transcript or reference structure.

- [ ] **Step 4: Keep copy and regeneration actions available**

When `referenceStructure.length > 0`, always render the generation action. Use `重新生成` when a final script exists, and render the copy action alongside it when output exists.

- [ ] **Step 5: Preserve reference state on generation failure**

Keep the existing transcript and reference structure when `/api/scripts/generate-final` fails; only the final script request state and message change.

### Task 4: Classify TikHub Failures And Retry Transient Requests Once

**Files:**
- Create: `lib/douyin/tikhub-request.ts`
- Create: `tests/douyin/tikhub-request.test.ts`
- Modify: `lib/douyin/transcript-provider.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing retry-policy tests**

Test a request callback that returns, in separate cases:

```ts
[new Response(null, { status: 500 }), new Response("{}", { status: 200 })]
[new Response(null, { status: 401 })]
[new Response(null, { status: 429 }), new Response(null, { status: 429 })]
```

Assert that 500 retries once and succeeds, 401 does not retry and is classified as authentication failure, and repeated 429 stops after two total attempts as a transient failure.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- tests/douyin/tikhub-request.test.ts`

Expected: FAIL because the request helper does not exist.

- [ ] **Step 3: Implement the request helper**

Export a helper accepting `request`, `maxRetries`, and `retryDelayMs`. Retry only thrown network errors, HTTP 429, and HTTP 5xx. Return one of these non-sensitive categories when exhausted:

```ts
"TIKHUB_PROVIDER_AUTH_FAILED"
"TIKHUB_PROVIDER_TRANSIENT_FAILED"
"TIKHUB_PROVIDER_REQUEST_FAILED"
```

- [ ] **Step 4: Integrate provider response classification**

Use the helper in the runtime TikHub provider. Classify a successful response containing neither transcript nor authorized media URL as `TIKHUB_PROVIDER_RESPONSE_UNSUPPORTED`. Keep the browser-facing fixed extraction message unchanged.

- [ ] **Step 5: Document retry delay configuration**

Add only the variable name and safe default to `.env.example`:

```dotenv
TIKHUB_RETRY_DELAY_MS="500"
```

- [ ] **Step 6: Run retry-policy tests**

Run: `npm test -- tests/douyin/tikhub-request.test.ts`

Expected: PASS with at most two total attempts.

### Task 5: Verify The Complete Change

**Files:**
- Modify: `docs/TEST_PLAN.md`
- Modify: `project-team/work-log.md`

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Run browser regression**

Verify:

1. Complete share text is accepted.
2. A successful extraction produces a reference structure.
3. Changing duration clears only the final script and does not create an extraction job.
4. Changing merchant project clears only the final script and does not create an extraction job.
5. Regeneration remains available after output.
6. Changing the normalized Douyin source clears reference and output state.
7. Console contains no relevant error or warning.

- [ ] **Step 3: Update project verification records**

Add the new cases and results without storing any complete source URL, transcript, generated script, media URL, provider payload, or secret.

- [ ] **Step 4: Record repository limitation**

Do not attempt commits because `/Users/douwenkai/Documents/yun ying` is not a Git repository. Report this limitation in the final summary.
