# Douyin Input And Regeneration Design

## Goal

Improve the existing script-generation workflow without expanding PRD v1 scope:

- Accept a complete Douyin share message, not only a bare URL.
- Reuse a successful transcript and reference analysis when the merchant project or duration changes.
- Re-extract only when the Douyin source changes.
- Diagnose extraction instability without exposing provider internals or sensitive content.

## Scope

This change does not add manual transcript entry, media upload, history, editing, batch generation, or a new content platform. Extracted transcripts and generated scripts remain page-session state and are not presented as reusable history.

## Input Normalization

The source field is plain text so the browser does not reject a complete share message before submission.

Both client and server use the same behavior:

1. Trim the input.
2. Find HTTP or HTTPS URLs in text order.
3. Select the first URL whose hostname is an allowed Douyin hostname.
4. Normalize surrounding punctuation away without altering the URL contents.
5. Reject the input with the existing fixed user-facing failure message when no valid Douyin URL exists.

The server is authoritative. Client normalization improves feedback but cannot replace server validation.

## Page State Model

The page maintains four distinct state groups:

- Source: raw share text and normalized Douyin URL.
- Reference: extracted transcript and reference structure.
- Generation inputs: selected merchant project and duration.
- Generation output: final script and copy feedback.

State invalidation rules:

- Editing the Douyin source clears reference state and generation output.
- Selecting another merchant project clears only generation output.
- Selecting another duration clears only generation output.
- A successful extraction stores the normalized source identity associated with the reference state.
- Generation is allowed only when reference state belongs to the current normalized source.

## Interaction Flow

1. User pastes a bare Douyin URL or complete Douyin share message.
2. User runs extraction and reference analysis once.
3. User selects a merchant project and duration, then generates the final script.
4. After generation, the copy action remains available and a separate regenerate action remains available.
5. Changing project or duration marks the current final script as stale and enables generation again without extraction.
6. Changing the Douyin source returns the workflow to the extraction step.

Every generation request continues to load the selected merchant project's latest saved profile on the server.

## Extraction Reliability

The current fixed user-facing failure message remains unchanged. Internally, failures are classified using non-sensitive summaries only:

- invalid source input;
- provider network or timeout failure;
- provider rate limit or server response;
- provider response with no supported transcript or media field;
- ASR submission or transcription failure.

One automatic retry is permitted only for transient network errors, rate limits, and provider server errors. Validation failures, authorization failures, unsupported response structures, and deterministic ASR failures are not retried blindly.

No logs may contain a full source URL, media URL, transcript, generated script, provider payload, or secret. Existing source host and short hash summaries are sufficient for correlation.

## Error Handling

- The page continues to show the fixed extraction failure text required by PRD v1.
- A failed regeneration does not discard the retained transcript or reference structure.
- A failed extraction leaves no stale reference structure attached to the new source.
- Internal error classification is available for aggregate diagnostics but is not returned as provider-specific detail to the browser.

## Verification

- Bare URL and complete share-message inputs normalize to the same Douyin source.
- Text without an allowed Douyin URL is rejected.
- Changing duration after generation does not create a new extraction job.
- Changing merchant project after generation does not create a new extraction job.
- Changing source clears transcript, reference structure, and final script.
- Regeneration reads the latest merchant profile from the server.
- Transient failures retry at most once; deterministic failures do not retry.
- Browser output and logs do not expose provider details or sensitive content.

## Known Limit

Input normalization and limited retry improve usability and transient reliability, but they cannot make an upstream provider support videos whose response contains neither a usable transcript nor an authorized media URL. Failure classification must be reviewed before choosing any further provider integration change.
