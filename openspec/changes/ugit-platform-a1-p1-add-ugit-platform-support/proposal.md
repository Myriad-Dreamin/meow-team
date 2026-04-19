## Why

The repository already lets owners persist `meow-team.platform=ugit`, but
runtime platform resolution still only registers the GitHub adapter and fails
for configured ugit repositories. Shipping a real ugit path now is necessary
so ugit-backed repositories can publish branches, synchronize pull requests,
and surface workflow state without GitHub-only assumptions.

## What Changes

- Introduce the `ugit-platform-a1-p1-add-ugit-platform-support` OpenSpec
  change for proposal "Add ugit platform support".
- Add a real ugit adapter under `lib/platform/ugit`, including a thin ugit
  command layer for remote normalization, branch publishing, and pull-request
  synchronization.
- Register ugit in the existing repository-aware platform resolution flow so
  `readRepositoryHarnessConfig()` and `resolveConfiguredGitPlatformId()`
  remain the only selection path while GitHub stays the default when unset.
- Generalize shared platform and team metadata so ugit-backed repositories can
  persist pushed-commit and pull-request tracking without requiring GitHub-only
  URLs or provider labels.
- Update operator-facing copy and targeted regression coverage for platform
  resolution, ugit publish and sync flows, and harness history behavior.

## Capabilities

### New Capabilities

- `ugit-platform-a1-p1-add-ugit-platform-support`: Add a real ugit platform
  adapter and provider-aware harness tracking so repositories configured with
  `meow-team.platform=ugit` can publish branches and synchronize pull requests.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat(platform/ugit): support ugit platform`
- Conventional title metadata: `feat(platform/ugit)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code and tests: `lib/platform/index.ts`, `lib/platform/types.ts`,
  new `lib/platform/ugit/*`, `lib/team/types.ts`, `lib/team/history.ts`,
  `lib/team/coding/*`, `lib/team/executing/*`, and targeted Vitest coverage
- Affected systems: repository-local platform resolution, branch publication,
  pull-request synchronization, lane history persistence, and approval or
  finalization activity rendering
- Validation expectation after implementation: `pnpm fmt`, `pnpm lint`,
  targeted Vitest coverage, and `pnpm build`
- Scope boundaries: no new `meow-team.platform` config surface, no ugit
  machine provisioning or `ugit create`, and no additional provider
  integrations beyond ugit
