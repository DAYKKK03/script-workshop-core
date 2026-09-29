# Custom Script Content Quality Design

## Goal

Improve custom-script length and usefulness without making the already working generation chain brittle again.

## Confirmed Product Decisions

- DeepSeek may use low-risk general industry knowledge for consumer education, common mistakes, causal explanations, judgment methods, practical suggestions, and limitations.
- Merchant-specific facts still come only from the selected project's latest profile. General knowledge must not invent the merchant's prices, activities, address, equipment, service process, qualifications, data, efficacy, or guarantees.
- Medical diagnosis, treatment, prescription, guaranteed efficacy, exact standards, and unsupported technical numbers remain prohibited. Beauty and skin-care scripts may explain general care concepts but must not diagnose a user.
- The original writing Markdown remains a design source, not a runtime attachment. Runtime uses a compact, versioned rule set and short de-identified examples.
- The writing target is 240—300 code points and the product target remains approximately 200—350. The internal safety range remains 80—350 so a safe short draft can still be returned instead of failing the whole chain.
- No real DeepSeek calls are part of this implementation round. Verification uses fixtures, unit/integration tests, type checking, lint, and production build only.

## Chosen Approach

Use a prompt-first quality upgrade plus a soft enrichment retry.

1. Expand the compressed runtime writing rules with bounded general-knowledge permissions, value-first structures by objective, and a compact bad/good contrast.
2. Require useful information before promotion. A normal script should contain at least two of: causal explanation, judgment standard, actionable method, or applicability/risk boundary.
3. When the first safe result is 80—199 code points, use the second and final provider allowance for a fresh knowledge-enrichment rewrite.
4. Before reserving the enrichment call, persist the first safe short result in `CustomScriptGenerationJob.result` as the strict internal `quality_fallback` shape. Public serialization ignores this processing-only state and never returns its script body.
5. If the enrichment call fails, returns `needs_profile`, produces invalid output, or the Worker crashes, a new Worker can reclaim the stale lease and complete the job from the durable fallback. A quality improvement attempt must never turn a usable result into a failed job.
6. If both safe scripts are available, prefer a 200—350 result; otherwise prefer the longer safe result. Success is still stored and charged exactly once.

## Objective Blueprints

- `auto`: default to value-first education and trust; do not open with merchant promotion.
- `traffic`: hook, misconception or reason, two useful takeaways, then an optional open question without forced CTA.
- `trust`: explain why, give a judgment method or transparent process, and state a limitation or risk.
- `conversion`: provide useful information first; merchant mention and one natural CTA may appear only near the end.

## Data Flow

```text
merchant facts + user request + objective/tone
→ bounded general-knowledge prompt
→ first validated result
→ 200—350: complete
→ 80—199: one fresh enrichment attempt
   → persist internal quality_fallback before reserving the call
   → better safe result: complete better result
   → failed/invalid/needs_profile: complete first safe result
   → Worker crash: stale reclaim validates and completes quality_fallback
```

## Error and Safety Behavior

- Existing JSON, non-speech, forbidden-expression, numeric-fact, CTA, duplicate, ownership, idempotency, quota, lease, and timeout checks stay active.
- A narrow sentence-level semantic safety layer rejects explicit medical diagnosis phrasing. It allows genuine education, prevention, uncertainty language, and advice to consult a doctor, but a trailing referral cannot sanitize an earlier definite diagnosis.
- High-risk merchant assertions require a trusted merchant subject (including the selected project name or its normalized brand name), a capability assertion verb, and a high-risk fact. Questions and education without a capability verb remain allowed; asserted equipment, qualifications, experts, or imported products must be supported by the latest profile.
- The enrichment request does not receive the first script body, preventing accidental persistence or prompt replay of invalid content.
- No new database fields or migrations are needed. `CustomScriptGenerationJob.result` already exists and stores only the strict internal `quality_fallback` shape while status is `processing`; terminal cancel/fail/success paths clear or replace it.
- Enrichment uses a 40-second total reserve: the 30-second lease recovery window, the Worker polling interval, and at least a 5-second success transaction plus database margin. With 40 seconds or less remaining, the Worker skips enrichment and commits the fallback without breaking the 120-second hard deadline.
- Sanitized diagnostics may distinguish `quality_enrichment`, but must not log scripts, prompts, merchant text, or user requirements.

## Alternatives Considered

### Send the full Markdown on every request

Rejected because it increases token cost and latency, weakens cache reuse, and risks copying merchant-specific example facts into unrelated scripts.

### Require every response to be at least 200 characters

Rejected because previous staging evidence showed that strict length rejection broke an otherwise healthy chain. Length is a quality target, not the only definition of a usable script.

### Build an external industry RAG library now

Deferred. It can later provide more stable domain depth, but it adds ingestion, retrieval, versioning, and evaluation complexity that is unnecessary for this focused quality fix.

## Acceptance Criteria

- Prompt fixtures show bounded general knowledge, value-first writing, objective-specific structures, and no full Markdown attachment.
- A first result of 200—350 completes in one provider call.
- A first result of 80—199 triggers at most one enrichment call.
- Enrichment failure still completes with the first safe result and charges quota once.
- Crash recovery before or after the second provider reservation completes from a strictly validated durable fallback; concurrent cancellation still wins and cannot be overwritten.
- Processing APIs never expose the internal fallback body.
- A valid longer enrichment result replaces the short fallback.
- Explicit diagnostic claims and unsupported high-risk merchant assertions remain rejected, while uncertain general education remains allowed.
- Local automated tests, type checking, lint, and production build pass. No real provider call or production deployment occurs in this round.

## Capability Boundary

This change improves the likelihood of longer, more useful, less advertisement-like scripts. It does not guarantee expert accuracy, viral performance, or a minimum 200-character result when the provider cannot produce one safely.
