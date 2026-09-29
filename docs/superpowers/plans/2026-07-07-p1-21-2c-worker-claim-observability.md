# P1-21.2C Worker Claim Observability

## Design reason

P1-21.2B already proved the sample extraction job never reached TikHub, ASR, or DeepSeek. The next missing fact is whether the worker loop is alive but skipping queued jobs, or whether claim conditions are silently filtering them out. This round adds only sanitized claim-stage observability so we can diagnose the queue boundary without changing business success/failure behavior.

## Design advantages

1. Keeps the fixed user-facing extraction failure message unchanged while making worker decisions visible to operators.
2. Distinguishes `no_candidate`, `not_due`, `expired`, `max_attempts`, `contention_lost`, and `db_error` at the claim boundary.
3. Reuses the existing worker loop and logging path instead of adding a new debug endpoint or storing raw provider payloads.

## Capability boundary

This module can:

- emit a periodic sanitized worker heartbeat;
- emit sanitized claim results for queued-job scans and claim attempts;
- summarize queued-job counts and candidate state without logging raw URLs or transcripts.

## Limitations

This module does not:

- fix provider behavior or retry strategy;
- expose raw SQL, raw third-party responses, or full source URLs;
- guarantee root-cause resolution by itself when runtime access or deployment is missing.
