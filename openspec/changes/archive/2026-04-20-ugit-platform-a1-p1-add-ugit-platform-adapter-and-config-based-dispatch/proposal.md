## Why

Meow Team already persists `meow-team.platform=ugit` in repository-local git
config, but platform resolution still treats that selection as an unsupported
placeholder and forces GitHub-only behavior everywhere else. Adding a real
`lib/platform/ugit` adapter now unlocks repository-local dispatch, keeps the
existing config contract intact, and lets ugit-backed repositories publish and
synchronize pull requests without forking team workflow code.

## What Changes

- Introduce the `ugit-platform-a1-p1-add-ugit-platform-adapter-and-config-based-dispatch`
  OpenSpec change for proposal "Add ugit platform adapter and config-based
  dispatch".
- Add a first-class `lib/platform/ugit` adapter plus any small ugit CLI helper
  needed to normalize repository URLs, publish branches, and create or update
  pull requests through `ugit` commands.
- Rework `lib/platform/index.ts` so platform operations resolve the adapter per
  repository from `meow-team.platform`, keep GitHub as the unset default, and
  dispatch `ugit` repositories to the new adapter instead of failing early.
- Preserve the existing repository config schema in `lib/config/repository.ts`;
  the change is runtime adapter selection, not configuration UX.
- Add focused tests around platform resolution and ugit publish / pull-request
  flows, including local-config-driven adapter selection.
- Validate the finished implementation with `pnpm fmt`, `pnpm lint`, focused
  Vitest coverage, and `pnpm build` once coding begins.

## Capabilities

### New Capabilities

- `ugit-platform-a1-p1-add-ugit-platform-adapter-and-config-based-dispatch`:
  Provide a first-class ugit platform adapter and route repository-local
  platform operations to it whenever `meow-team.platform=ugit` is configured.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat(platform/ugit): add ugit platform support`
- Conventional title metadata: `feat(platform/ugit)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code and tests: `lib/platform/index.ts`, `lib/platform/types.ts`,
  new modules under `lib/platform/ugit`, shared CLI wrappers if needed,
  `lib/config/repository.ts` call sites, and focused Vitest coverage around
  `lib/platform/index.test.ts`
- Affected systems: repository-local platform dispatch, URL normalization,
  branch publishing, and pull-request synchronization for GitHub and ugit
  repositories
- External dependency surface: the existing `ugit` CLI becomes a runtime
  dependency for repositories that opt into `meow-team.platform=ugit`
- Planner deliverable: Single proposal recommended because adapter creation,
  dispatch wiring, and regression coverage need to land together to make ugit
  support usable
