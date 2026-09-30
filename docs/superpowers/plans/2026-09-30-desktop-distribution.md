# Desktop Distribution Implementation Plan

**Goal:** Deliver platform-specific application packages that need no user-installed Docker, Node.js or PostgreSQL and allow provider configuration through a local settings page.

**Architecture:** Electron owns a local PostgreSQL 16 process, the existing standalone Web server and three compiled Workers. Settings use the OS encryption facility. Bundled binaries and application code are read-only; persistent user data lives under Electron userData. Application and database ports bind only to loopback.

**Tech Stack:** Existing Next.js/Prisma/PostgreSQL application, Electron, embedded-postgres, electron-builder, esbuild, ffmpeg-static.

## Constraints

- Work in script-workshop-core only; preserve the original repository and current acceptance report.
- Preserve auth, invitation, ownership and all four business modules; no digital-human feature.
- No provider requests during automated testing. Empty provider settings must give the existing unavailable states.
- No real keys or user data in packages, logs or Git.
- Cross-platform package success and runtime success are distinct; report both truthfully.

## Modules

- [ ] Resolve inherited acceptance failures: align TopicGenerationJob index with existing migration; update patched dependencies and lockfile; make small-window navigation operable.
- [ ] Add `desktop/config.cjs`: strict provider-field allowlist, defaults, URL validation, generated internal credentials and encrypted config storage. Test fresh setup, persistence, invalid fields, masked reads and secret exclusion.
- [ ] Add `desktop/runtime.cjs` and `desktop/tasks/*`: choose loopback ports, initialise bundled PostgreSQL, migrate/seed a first local invite, start Web/Workers, track and stop only owned processes. Test startup failure cleanup and repeated stop; perform real empty-database and restart tests without Docker.
- [ ] Add `desktop/main.cjs`, preload and local settings renderer: isolated window, trusted IPC sender checks, startup status, Key settings, invitation display, app launch and graceful shutdown. Saving settings restarts runtime explicitly and prevents duplicate concurrent starts.
- [ ] Add packaging preparation and platform build workflow: bundle standalone assets, compiled Workers, Prisma runtime/migrations, PostgreSQL and FFmpeg; exclude environment files and user data. Build per host architecture, with checksums and smoke-test evidence.
- [ ] Re-run tests, types, lint, build, audit and database schema diff; give the existing independent acceptance Agent a bounded review of the desktop module and retained application.
- [ ] Update installation docs and GitHub source; publish only verified application artifacts and describe unsigned/notarization status and unsupported targets accurately.

## Required checks

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm audit --omit=dev --audit-level=high`, desktop unit tests, bundled PostgreSQL migration/schema checks, authenticated HTTP CRUD and restart persistence, and platform package startup checks. The process lifecycle test must confirm no child remains after exit. A packaged build must include its dependencies rather than relying on the developer checkout.
