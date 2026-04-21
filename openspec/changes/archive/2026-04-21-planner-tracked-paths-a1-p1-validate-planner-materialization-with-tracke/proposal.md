## Why

The planner's OpenSpec materialization guard currently filters unexpected paths
through planner-worktree `.gitignore` rules, which lets untracked residue such
as `.codex/*` pass only because the repository ignores it and keeps a direct
runtime dependency on `ignore` in the planner path. The planner only needs to
block tracked or committed contamination outside the proposal directory, so
switching to tracked-path isolation removes the `.codex` false-positive problem
without preserving ignore-driven behavior.

## What Changes

- Introduce the
  `planner-tracked-paths-a1-p1-validate-planner-materialization-with-tracke`
  OpenSpec change for proposal "Validate planner materialization with tracked
  paths only".
- Refactor planner proposal materialization in `lib/team/openspec.ts` so the
  outside-path isolation check is driven by tracked members of the uncommitted
  delta plus committed path deltas, instead of loading planner-worktree
  `.gitignore` rules.
- Remove the direct `ignore` dependency from `package.json` and refresh
  `pnpm-lock.yaml` once planner validation no longer needs repository ignore
  matching.
- Extend `lib/team/openspec.test.ts` so untracked residue like `.codex` is
  tolerated, while tracked unexpected paths including tracked `.codex` still
  fail the planner isolation guard.
- Refresh the planner OpenSpec contract so it no longer claims outside-path
  validation is based on repository `.gitignore` rules and instead documents
  tracked and committed path isolation.
- Keep proposal artifact checks, prior-snapshot protection, and planner
  HEAD-stability validation unchanged.

## Capabilities

### New Capabilities

- `planner-tracked-paths-a1-p1-validate-planner-materialization-with-tracke`:
  Validate planner proposal materialization against tracked worktree deltas and
  committed path deltas only, allowing untracked residue outside the proposal
  directory while still rejecting tracked or committed unexpected paths.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `fix(planner/openspec): limit planner materialization to tracked paths`
- Conventional title metadata: `fix(planner/openspec)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code: `lib/team/openspec.ts`, `lib/team/openspec.test.ts`,
  `package.json`, `pnpm-lock.yaml`
- Removed dependency: direct runtime dependency on `ignore`
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: one focused planner-materialization fix that keeps the
  coding-review pool idle until a human approves the proposal, then updates the
  isolation rule, regression coverage, and OpenSpec text together
