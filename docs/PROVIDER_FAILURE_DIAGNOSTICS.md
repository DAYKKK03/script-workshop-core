# Provider Failure Diagnostics Rules

## Purpose

This document records the debugging rule learned from the staging Douyin extraction incident on 2026-07-08: external Provider failures must never collapse into one large opaque error code during internal diagnosis.

Public users must still see only the fixed safe message:

```text
当前链接无法自动提取，请更换可提取的抖音视频链接
```

Internal OWNER diagnostics and agent handoffs must preserve sanitized failure detail so the team can tell whether the failure belongs to URL parsing, TikHub, media selection, ASR submit, ASR query, DeepSeek, deployment drift, or runtime configuration.

## Rule

Any external Provider failure that reaches a persisted job must include a safe subtype.

Bad internal state:

```text
ASR_SUBMIT_FAILED
```

Good internal state:

```text
ASR_SUBMIT_FAILED__fr=submit_auth_rejected
ASR_SUBMIT_FAILED__fr=submit_request_rejected
ASR_SUBMIT_FAILED__fr=submit_invalid_response
ASR_SUBMIT_FAILED__fr=submit_network
ASR_SUBMIT_FAILED__fr=unknown_submit_failure
```

The subtype must be an allowlisted enum. It must not include secrets, raw provider responses, complete media URLs, complete source URLs, transcripts, request bodies, account IDs, or stack traces.

## Required Boundaries

- Public API responses must keep using the fixed extraction failure copy.
- OWNER diagnostics may show only sanitized fields: hash8 identifiers, host, source hash, base error code, subtype enum, attempts, timestamps, transcript length bucket, selected media path, and candidate path summary.
- Logs and docs must not include raw TikHub responses, raw Volcengine responses, full media URLs, full source URLs, transcripts, or credentials.
- Provider diagnostics must not require a schema change when the existing `errorCode` can safely carry a structured subtype.

## Runtime Deployment Gate

Before running another real-provider staging repro, confirm the running web and worker images contain the diagnostic code.

Minimum evidence:

```text
contains_encode > 0
contains_failureReason > 0
contains_fr_literal > 0
```

If the runtime reports all three as `0`, stop Provider debugging. The staging image is stale or missing the diagnostic build, and any new repro will only produce an opaque failure again.

## Agent Checklist

Before asking the user to change Provider configuration:

1. Confirm a backend `ExtractionJob` exists. If no job exists, debug URL parsing or API creation first.
2. Confirm web and worker are healthy.
3. Confirm runtime diagnostic code is present in the running image.
4. Query the latest job using sanitized fields only.
5. If `errorCode` has no subtype, restore/deploy the diagnostic image before changing Provider settings.
6. If a subtype exists, fix only that layer:
   - `submit_auth_rejected`: check Provider service activation, resource authorization, key/token ownership, and project/account match.
   - `submit_request_rejected`: inspect request contract, required headers, model/resource names, audio format, and body shape.
   - `submit_invalid_response`: update parser against official response contract.
   - `submit_network`: check connectivity, timeout, DNS, and retry policy.
   - media selection errors: inspect sanitized TikHub media path/candidate summary.

## Why This Exists

The July 2026 staging incident burned multiple loops because the system repeatedly showed only `ASR_SUBMIT_FAILED`. That made several different causes look identical:

- firewalled or stale staging runtime;
- missing diagnostic code after redeploy;
- Volcengine endpoint/resource/key drift;
- ASR request contract problems;
- TikHub media path problems.

The durable fix is not to expose more detail to users. The durable fix is to keep user-facing errors safe while preserving enough internal, sanitized detail for operators and agents to make the next action obvious.

Topic batch requests use one shared 45-second provider deadline across the normal and fresh-connection empty-envelope attempts, constrained by the job deadline minus a 30-second guard. Diagnostics may expose only the batch budget, remaining-time bucket, transport status class, content-type class, transfer mode, response-length bucket, elapsed time, and connection mode; request and response contents remain excluded.

DeepSeek response observability is deliberately bucketed: usage prompt/completion tokens use ranges, reasoning/content are recorded only as `reasoningCharLengthBucket`/`contentCharLengthBucket`, and topic requests explicitly record `thinkingMode=disabled`. Non-topic callers retain the default omitted mode. Prompts, merchant text, reasoning text, model content, keys, and plaintext identifiers are never logged.

Topic validation diagnostics also include a safe `validationStage` (`batch`, `top3`, or `assembly`) and allowlisted `parserReason`; batch indexes are emitted only for a known scene batch, while assembly failures do not receive a fabricated provider batch index.

Assembly failures additionally expose only an allowlisted `assemblyRule`: `batch_count`, `batch_size`, `idea_count`, `coordinate_duplicate`, `coordinate_mismatch`, `title_duplicate`, `top_objective`, `top_coordinate_duplicate`, or `top_coordinate_missing`. No title, keyword, scene, coordinate value, body, or identifier is logged.

Batch title uniqueness uses one shared normalized-title function across batch and assembly validation. Polling and task creation errors are separate client stages: a poll timeout retains the job for resume and never presents itself as a create timeout.

Batch title duplicate diagnostics include only allowlisted `duplicateScope=within_batch`, `against_existing`, or `both`, plus `duplicateCountBucket=0|1|2-5|>5` and `uniquePreservedCountBucket=0|1-4|5`. These buckets are computed in memory from violating item indexes; normalized titles, coordinates, and prior-title lists are never logged. This patch is observation-only: prompts, retry behavior, model parameters, and generation logic remain unchanged.

Only the second semantic attempt for `against_existing` receives the extra self-check instruction; within-batch duplicates retain the existing retry instruction and the maximum remains two attempts.

After both semantic attempts fail with a batch title duplicate affecting 1–5 items, the worker performs at most one targeted repair request for all violating items in that batch. Compliant items remain in memory, repair output must match the exact requested coordinates and full idea schema, and the complete batch is revalidated for count, coordinates, title uniqueness, fixed viral elements, and safety before assembly. Repair telemetry is limited to `duplicateRepairStage=detected|requested|validated|failed`, the existing duplicate buckets, batch index, and semantic attempt count; no repair title or coordinate value is logged or persisted. If the deadline guard is insufficient, no repair request is made.

The staging Topic log workflow also runs a read-only database summary before printing recent worker events. It reports only 30-day outcome counts by terminal status and safe error code, plus an aggregate count of direct failed-then-succeeded retries for the same internal user/project pair within 30 minutes. The pair is used only in process memory and is never printed. Job IDs, user IDs, project IDs, request IDs, input, result, merchant data, prompts, and model content are excluded. This summary does not call DeepSeek and does not change jobs or quota.

Historical job rows do not store batch-level parser diagnostics. The database summary can distinguish terminal provider, timeout, validation, and task failures, but `batchIndex`, `parserReason`, `finishReason`, and duplicate-repair stage still require a recent sanitized worker outcome event. If container logs were cleared, do not infer those fields from the terminal error code.
