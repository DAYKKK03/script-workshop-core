# Topic Failure Diagnostics Plan

## Goal

Determine why a topic generation can fail once and succeed on the next submission without calling DeepSeek or exposing user or merchant data.

## Scope

- Extend the existing read-only staging topic runtime probe.
- Report aggregated recent job outcomes by safe status and error code.
- Report how often a failed job is followed by a successful job for the same user and project within 30 minutes.
- Run the probe through the existing staging log workflow without changing generation behavior.

## Technical choice

Reuse Prisma and the existing self-hosted staging workflow. This is safer and cheaper than adding a monitoring dependency or triggering new provider calls. Raw user IDs, project IDs, request IDs, job IDs, input, result, merchant data, and model content must never be printed.

## Files

- `scripts/staging-topic-runtime-probe.ts`: derive sanitized aggregates from recent jobs.
- `.github/workflows/staging-topic-log-probe.yml`: check out the selected ref and run the read-only probe in the deployed worker container.
- `tests/ui/topics-page.test.ts`: enforce the diagnostic privacy and workflow contract.
- `docs/PROVIDER_FAILURE_DIAGNOSTICS.md`: document capabilities and limits.

## Test strategy

1. Add a failing source-contract test for the new aggregates and forbidden identifiers.
2. Implement the minimum probe and workflow wiring.
3. Run the focused test, typecheck, lint, full test suite, and production build.
4. Dispatch the workflow on staging and inspect only sanitized output.

## Completion criteria

- No DeepSeek request is made.
- Output includes recent outcome counts and failed-then-succeeded count.
- Output cannot include raw identifiers, merchant data, prompt, input, result, or model content.
- The workflow removes the copied probe after execution.
- Evidence narrows the failure to a stored error category or explicitly states that more live evidence is required.

## Limits

Historical jobs store the terminal error code but not batch-level parser diagnostics. This probe can identify provider/timeout/validation categories and retry patterns, but a future failure must still be captured in the existing sanitized worker log to identify `batchIndex`, `parserReason`, and `finishReason`.
