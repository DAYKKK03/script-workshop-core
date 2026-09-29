# P1-21.2D Create-to-Worker Observability

## Design reason

P1-21.2B and P1-21.2C narrowed the new staging failure to a `queued` `ExtractionJob` that did not reach TikHub, ASR, or DeepSeek. That is a different breakpoint from the historical TikHub and ASR fixes, so the next safe step is to connect the job lifecycle from creation to the worker's first queue scan without changing provider behavior.

## Advantages

- Keeps the investigation on the queue/claim boundary instead of regressing into blind TikHub or ASR changes.
- Adds sanitized lifecycle evidence that links one job across API creation, client polling, and worker scans.
- Preserves the existing fixed user-facing error message and success/failure rules.

## Capability boundary

- Logs sanitized job lifecycle summaries at creation and observation time.
- Logs the oldest queued and due job summaries on worker heartbeat ticks.
- Supports one-sample staging repros by correlating `jobId`, `sourceHost`, and `sourceHash` without exposing the raw URL or transcript.

## Limitations

- This module does not change worker claim logic, provider behavior, or user-visible responses.
- It does not prove the final root cause on its own; it only shows where the job exists or disappears between creation and claim.
- Staging repro still requires a single controlled sample request and runtime log access.
