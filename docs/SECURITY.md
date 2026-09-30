# Production Dependency Security Upgrades

## Scope and current resolution

This document records the production dependency security upgrade, not a single PostCSS override. The lockfile resolves the approved combination:

- `next@15.5.23` and `eslint-config-next@15.5.23`.
- Nested `next > postcss@8.5.26` override.
- Nested `@prisma/config > deepmerge-ts@8.0.2` override while `prisma` and
  `@prisma/client` remain at `6.19.3`.
- Global `sharp@0.35.3` override.
- `nanoid` remains transitive and resolves to a safe 3.x release; it is not a direct dependency.

## Evidence and boundaries

`npm audit --omit=dev --audit-level=high` reports zero high or critical production findings for this resolved graph. This statement does not cover a complete audit including development dependencies: that audit can retain independent toolchain findings and must not be described as a repository-wide zero-vulnerability result.

The PostCSS style-escaping regression test proves only that existing `</style>` escaping behavior remains intact. The Prisma deepmerge regression uses an isolated, timeout-bounded child process so recursive input cannot exhaust the main test runner's stack. Neither test proves that every dependency advisory is mitigated or that the application has general security coverage.

Sharp is a native-module compatibility risk as well as a dependency update. Merging or deploying requires Node 22 Alpine Docker build verification, an in-container Sharp transformation, and staging smoke verification in addition to the normal audit, tests, lint, typecheck, build, and Prisma gates.

## Removal rule

These overrides may be removed only after the relevant upstream dependency itself resolves the required fixed version, followed by successful production audit, tests, Docker validation, and staging gates. Do not remove them solely because a newer transitive package exists. In particular, the Prisma nested override must not be removed or replaced with a Prisma downgrade or Prisma 7 upgrade as part of this security repair.
