# P1-21.2B Sanitized Observability Plan

## Design Reason

Current staging extraction failures are already narrowed to the TikHub request stage, but the runtime only preserves a generic fixed user-facing message. We need one round of minimal, sanitized observability so we can distinguish auth failures, unsupported-request failures, and transient failures without exposing secrets, full URLs, raw provider bodies, or changing product behavior.

## Design Advantages

1. Keeps the fixed PRD failure message unchanged for users.
2. Adds just enough evidence to diagnose a single failing sample with low provider spend.
3. Limits persistence to existing safe boundaries: internal error codes plus redacted logs only.
4. Reuses the current ExtractionJob/worker path instead of introducing a new debug surface.

## Capability Boundary

This module can:

1. Record provider name, internal error code, retryability, HTTP status, and response/hash summaries.
2. Correlate a failing extraction job with a redacted source hash and job id.
3. Support a single-sample staging repro without exposing the original link or provider body.

This module cannot:

1. Fix TikHub provider failures by itself.
2. Bypass unsupported links, auth problems, or provider limits.
3. Reveal full upstream responses, secrets, media URLs, transcripts, or generated scripts.

## Limitation Notes

1. If the current staging image is not redeployed, the new observability will not appear in runtime logs.
2. If provider failures happen before a response body exists, only status/category level evidence will be available.
3. This round does not change success/failure semantics, retry policy, or front-end copy.
