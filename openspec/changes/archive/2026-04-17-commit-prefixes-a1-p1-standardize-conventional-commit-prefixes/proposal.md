## Why

The harness already standardizes request and PR titles around conventional
metadata, but the repository-managed commits created during planner
materialization and coder execution still use `planner:` and `coder:` subjects.
That leaves generated history inconsistent with the repo's own conventions and
gives agents mixed commit guidance when they need to author a commit directly.

Standardizing harness-managed commit subjects now keeps proposal
materialization, coding and archive automation, and direct lane-authored
commits on the same deterministic `docs:` / `dev:` / `fix:` / `test:`
vocabulary. Ambiguous internal work should fall back to `dev:` instead of
guessing or introducing ad hoc prefixes.

## What Changes

- Introduce a shared harness commit-message formatter or classifier that emits
  lowercase `docs:`, `dev:`, `fix:`, and `test:` prefixes and defaults
  ambiguous internal implementation work to `dev:`.
- Update planner proposal materialization in `lib/team/openspec.ts` so
  generated proposal and spec commits use `docs:` instead of `planner:`.
- Update coder auto-commit generation in `lib/team/coding/reviewing.ts` so
  default implementation work maps to `dev:`, proposal, archive, or
  documentation-oriented work maps to `docs:`, repair-oriented runs map to
  `fix:`, and explicit test-only work maps to `test:`.
- Align coder and reviewer lane prompt guidance so any direct `git commit`
  commands authored by agents follow the same lowercase conventional format.
- Add regression coverage around the shared formatter and the current commit
  call sites, especially `lib/git/ops-materialization.test.ts`,
  `lib/team/openspec.test.ts`, and `lib/team/coding/index.test.ts`.

## Capabilities

### New Capabilities

- `commit-prefixes-a1-p1-standardize-conventional-commit-prefixes`:
  Standardize harness-managed commit subjects across planner proposal
  materialization, coder implementation and archive flows, direct
  agent-authored commit guidance, and regression coverage for deterministic
  `docs:` / `dev:` / `fix:` / `test:` mapping.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `dev(harness/commits): standardize harness commit prefixes`
- Conventional title metadata: `dev(harness/commits)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code: `lib/team/openspec.ts`, `lib/team/coding/reviewing.ts`,
  shared commit-formatting helpers, and coder and reviewer lane prompts under
  `lib/team/roles`
- Affected validation: `lib/git/ops-materialization.test.ts`,
  `lib/team/openspec.test.ts`, `lib/team/coding/index.test.ts`, plus the
  existing formatter and lint checks used by the harness
- Scope boundaries: keep request-title and PR-title behavior unchanged unless a
  small helper extraction is needed; do not add commitlint, hooks, or new
  conventional types beyond `dev`, `docs`, `fix`, and `test`
