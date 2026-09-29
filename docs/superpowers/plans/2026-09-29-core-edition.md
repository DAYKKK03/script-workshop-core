# Core Edition Implementation Plan

**Goal:** Publish a separate private GitHub repository containing the script-workshop application without digital-human functionality.

**Architecture:** Export committed source b35380ca7e879c06c2b792bb0c94ac750862f46f into a separate repository. Remove the module and its database dependencies; preserve existing authentication, ownership and script-provider boundaries.

**Tech Stack:** Next.js, TypeScript, Prisma/PostgreSQL, Node test runner, GitHub CLI.

## Constraints

- Work only in /Users/douwenkai/Documents/script-workshop-core.
- Do not copy live environment files, personal files, cloud data or uncommitted work.
- Keep ASR and media relay required for script extraction.
- Publish source only; do not trigger deployment or paid providers.

## Tasks

- [x] Export the pinned committed snapshot; record the approved design.
- [x] Update `tests/ui/app-shell-navigation.test.ts` to require four navigation destinations and no placeholder. Run it and observe the expected failure, then remove placeholder state/dialog from `components/app-shell.tsx`.
- [x] Add `tests/projects/delete-service.test.ts` covering successful deletion, wrong ownership and missing project without a digital-human dependency. Replace the cleanup-coupled service with `prisma.project.deleteMany({ where: { id: projectId, userId } })`; return `{ id: projectId }` only when count is one, otherwise the existing 404 error.
- [x] Remove digital-human models, relations, usage counters and enums from `prisma/schema.prisma`, plus its seven dedicated migrations. Keep the original five core migrations for fresh installations.
- [x] Remove `lib/lip-sync`, `tests/lip-sync`, the voice helper, dedicated probe scripts and audio cleanup Worker. Remove the associated package commands, environment section, test Compose service and obsolete test expectations. Preserve normal retention work.
- [x] Update README, scope/status docs and workflow triggers for the independent source-only repository; remove digital-human-only documentation/assets and obsolete local-runtime plans that are not implemented in this snapshot.
- [x] Run `npm ci`, `npx prisma generate`, `npx prisma validate`, `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` using non-secret verification settings. Review schema consistency, leftover references and staged files.
- [x] Commit the reviewed core snapshot, create private `DAYKKK03/script-workshop-core`, push `main` and verify the remote commit and visibility. Record verification results and limitations.
