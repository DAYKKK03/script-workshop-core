# Custom Script Link-First Generation Design

## Decision

For the current staging-first phase, prioritize a complete, low-cost generation path over strict 60-second length control. The page keeps an approximate 200–350-character creation target, while the server accepts complete, safe scripts within an internal 80–350 Unicode code-point range. The prompt still targets 240–300 code points; the internal 80-code-point floor is not exposed to users or the model.

## Design reasons

The real staging probe produced valid 24-sentence JSON in the first four rounds. The only failure occurred in the second, strict length-repair step (`no_solution`) after the base response had already passed JSON, coordinate, safety, and fact checks. Removing that repair dependency avoids a second DeepSeek call and prevents a valid short draft from being discarded.

## Runtime behavior

- The custom-script Worker validates a single `success.finalScript` response against the internal 80–350 code-point safety range.
- The prompt requests 240–300 code points with natural paragraphs and line breaks, without sentence-length or one-sentence-per-line constraints. It prioritizes a complete, safe voice script, forbids inventing facts to add length, caps output at350, and does not reveal the internal minimum.
- The prefixId replacement probe remains isolated staging evidence and is not connected to the product Worker in this phase.
- A second semantic attempt is used only for malformed JSON, safety/domain rejection, or a result outside80–350; a valid 80–350 response is accepted immediately.
- Failed jobs do not charge daily quota. A successful completion charges exactly once through the existing transaction and idempotency path.

## UI and API contract

The `/custom-scripts` page describes approximately 200–350 characters as the creation target and clarifies that completeness takes priority. It does not expose the internal 80-code-point minimum. No title, storyboard, timeline, or explanation is added to the response. Copy, regenerate, project isolation, source validation, cancellation, and quota behavior remain unchanged.

## Benefits

- Removes the failing prefix-selection dependency from the user path.
- Reduces normal successful generations from two provider calls to one.
- Preserves merchant fact safety, forbidden-expression checks, idempotency, and quota atomicity.
- Provides a clear later tightening point: once real usage data is available, the acceptance band can return to 280–300 without changing the page workflow.

## Boundaries and limitations

- The internal 80–350 acceptance range can produce a wider speaking-time range than the original 60-second promise; the page target remains approximately 200–350 characters.
- The wider band is a staging/product phase decision, not a playback-duration guarantee.
- This phase does not add history, editing, publishing analytics, or production rollout.

## Acceptance criteria

- Valid scripts with 80, 150, 199, 200, and 350 code points pass; 79 and 351 fail with sanitized length diagnostics.
- A valid150-code-point response uses one provider call and charges quota once; replaying the same UUID neither calls the provider nor charges quota again.
- Invalid, unsafe, cross-project, duplicate, concurrent, and over-limit requests retain existing behavior.
- Staging real generation passes five consecutive runs without exposing merchant data or raw model output in logs.
- Typecheck, lint, tests, production build, and staging deployment pass before page acceptance.

## Manual staging probe

The workflow `Staging custom script link-first probe` is manual-only and runs against the exact SHA recorded in staging. It reads only the fixed staging merchant profile, then calls the production `requestCustomScriptAttempt` service path for up to five serial runs. Each run uses the product 120-second deadline, accepts the internal 80–350 code-point safety range, and retries one invalid semantic response at most once without prefixId repair.

The probe does not create a custom-script Job, write account usage counters, or consume daily script quota. Provider usage attribution is removed at the probe boundary. Standard output contains only `runIndex`, `status`, `providerCalls`, `durationMs`, `lengthBucket`, `parserReason`, `scriptLengthBucket`, `finishReason`, and `providerSubreason`, followed by `gate` and `runsCompleted`. It stops at the first failed run to bound external cost.
