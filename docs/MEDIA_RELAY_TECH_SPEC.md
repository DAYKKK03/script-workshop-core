# Media Relay Tech Spec

## Purpose

TikHub can return Douyin CDN media URLs when it cannot provide a usable transcript. Volcengine ASR only receives an `audio.url` and cannot be given the downloader headers that some CDN URLs may require. The relay path makes that handoff stable without adding manual paste/upload fallback:

`TikHub media URL -> server-controlled temporary download -> FFmpeg audio extraction -> temporary COS object URL -> Volcengine ASR`.

## Design Rationale

- The app keeps the compliant provider boundary: TikHub supplies authorized metadata/media, the server processes it, and Volcengine ASR transcribes a stable temporary media URL.
- The relay is opt-in through `MEDIA_RELAY_ENABLED=1`; missing object storage configuration fails closed.
- The server does not persist original video or MP3 files. Local files live only in a dedicated temp directory and are removed in `finally`.
- A relayed COS object is deleted after ASR reaches a confirmed terminal state. If ASR may still be processing, deletion is deferred to the bucket lifecycle fallback.
- The database stores only transcript and sanitized job state. It must not store raw media URLs, object keys, raw provider responses, or transcripts in diagnostics.

## Server Protection

- Default relay concurrency is `1`.
- The `ip-http` worker already runs one replica with `EXTRACTION_WORKER_CONCURRENCY=1`; the relay also has an in-process limiter for defense in depth.
- Download accepts only `http`/`https` URLs.
- SSRF protection rejects localhost, loopback, private, link-local, carrier-grade NAT, multicast, and other reserved IP ranges after DNS resolution.
- Download has timeout, redirect count, content-type allowlist, and max input bytes.
- FFmpeg runs with timeout, max duration, single-channel 16 kHz MP3 output, and max output bytes.
- Relay diagnostics use only status classes, content-type, size/duration buckets, object key hash8, and cleanup result.
- Remote cleanup diagnostics contain only whether deletion was attempted, a fixed result enum, and the object key hash8.

## Storage Contract

Runtime variables:

- `MEDIA_RELAY_ENABLED`
- `MEDIA_RELAY_CONCURRENCY`
- `MEDIA_RELAY_TMP_DIR`
- `MEDIA_RELAY_MAX_INPUT_BYTES`
- `MEDIA_RELAY_MAX_OUTPUT_BYTES`
- `MEDIA_RELAY_MAX_DURATION_SECONDS`
- `MEDIA_RELAY_DOWNLOAD_TIMEOUT_MS`
- `MEDIA_RELAY_FFMPEG_TIMEOUT_MS`
- `MEDIA_RELAY_MAX_REDIRECTS`
- `MEDIA_RELAY_OBJECT_PREFIX`
- `MEDIA_RELAY_PUBLIC_BASE_URL`
- `COS_BUCKET`
- `COS_REGION`
- `COS_ENDPOINT`
- `COS_ACCESS_KEY_ID`
- `COS_SECRET_ACCESS_KEY`

`MEDIA_RELAY_PUBLIC_BASE_URL` must point to an externally reachable object URL namespace that Volcengine ASR can fetch. The runtime identity needs `PutObject` and `DeleteObject` only for the dedicated relay prefix. Anonymous access may receive `GetObject` only for that prefix; it must not receive `ListBucket`.

The Tencent COS object-storage adapter uses the official `cos-nodejs-sdk-v5` package for `PutObject` and `DeleteObject`. The project code must not hand-roll COS request signing; it only owns relay safety checks, object key construction, public URL construction, and sanitized diagnostics.

COS lifecycle expiration has a minimum of one day, so configure a one-day expiration rule for `MEDIA_RELAY_OBJECT_PREFIX` as a fallback. Shorter retention comes from application-level `DeleteObject` after an ASR terminal state, not from a one-hour COS lifecycle rule. If query polling times out or fails without a confirmed terminal provider state, the object remains for the lifecycle fallback rather than being deleted too early.

## Limits

- This is not a user upload feature.
- This does not keep a media archive.
- This does not bypass Douyin login, scraping, or platform restrictions.
- This does not make private COS objects readable unless the provided public base URL or bucket policy allows Volcengine ASR to fetch them.
- Application-level deletion is best effort. A delete failure does not fail transcription; the one-day lifecycle rule remains mandatory.
