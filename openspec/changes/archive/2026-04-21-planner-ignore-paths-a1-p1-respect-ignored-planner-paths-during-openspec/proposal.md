## Why

The planner's OpenSpec materialization guard currently rejects any changed path
outside the proposal directory, even when the repository already ignores that
path. This produces false failures for planner-side byproducts such as
`.codex/*`, so proposal materialization needs to honor repository `.gitignore`
rules while still rejecting real unrelated edits.

## What Changes

- Introduce the
  `planner-ignore-paths-a1-p1-respect-ignored-planner-paths-during-openspec`
  OpenSpec change for proposal "Respect ignored planner paths during OpenSpec
  materialization".
- Update the planner materialization validation path in `lib/team/openspec.ts`
  to filter unexpected worktree delta paths through repository ignore rules
  before raising the outside-path error.
- Add a direct `ignore` dependency and refresh `pnpm-lock.yaml` so planner
  validation can load repository `.gitignore` rules in-process.
- Extend `lib/team/openspec.test.ts` with regression coverage for ignored
  `.codex` residue and a guard that non-ignored `README.md`-style edits still
  fail.
- Keep the change scoped to planner delta validation; prior proposal snapshot
  checks, expected artifact checks, and the existing failure mode for
  non-ignored unrelated edits stay intact.

## Capabilities

### New Capabilities

- `planner-ignore-paths-a1-p1-respect-ignored-planner-paths-during-openspec`:
  Make OpenSpec planner materialization respect repository ignore rules for
  unrelated ignored byproducts while preserving failures for non-ignored
  planner worktree edits.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `fix(openspec/planner): honor ignored planner paths`
- Conventional title metadata: `fix(openspec/planner)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code: `lib/team/openspec.ts`, `lib/team/openspec.test.ts`,
  `package.json`, `pnpm-lock.yaml`
- New dependency: direct runtime dependency on `ignore`
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Implement one focused change to make OpenSpec planner
  path-isolation checks respect repository ignore rules, including the ignored
  `.codex` case, while still rejecting non-ignored unrelated edits and
  finishing with repository-standard `pnpm` validation.
