## Context

This change captures proposal "Validate planner materialization with tracked
paths only" as OpenSpec change
`planner-tracked-paths-a1-p1-validate-planner-materialization-with-tracke`.
Today `listMaterializationChangedPaths()` already merges uncommitted worktree
delta paths with committed paths between planner HEAD revisions, but
`assertProposalChangeDeltaIsIsolated()` still filters unexpected paths through
planner-worktree `.gitignore` rules loaded via the `ignore` package. That makes
planner isolation depend on repository ignore semantics when the requested rule
is narrower: tolerate untracked residue outside the proposal path, but fail for
tracked or committed unexpected paths, including tracked files under `.codex/`.

Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Replace `.gitignore`-based outside-path filtering with tracked and committed
  path isolation in the planner materialization flow.
- Remove the direct `ignore` dependency and planner-worktree ignore loading
  from the proposal materialization path.
- Keep untracked outside-path residue such as `.codex` from failing
  materialization while preserving failures for tracked or committed unexpected
  paths.
- Update regression coverage and OpenSpec contract text to match the new rule.
- Preserve the canonical request/PR title
  `fix(planner/openspec): limit planner materialization to tracked paths` and
  conventional-title metadata `fix(planner/openspec)` across the materialized
  artifacts.

**Non-Goals:**
- Change proposal artifact existence checks, prior-snapshot protection, or
  planner HEAD-stability validation.
- Introduce hardcoded allowlists such as a `.codex` exception.
- Broaden planner validation beyond the OpenSpec materialization flow in
  `lib/team/openspec.ts`.
- Alter the default `planner -> coder -> reviewer` execution workflow or start
  coding-review lanes before approval.

## Decisions

- Derive outside-path enforcement from two normalized path sets: tracked members
  of the uncommitted materialization delta and committed paths between planner
  HEAD revisions. Alternative considered: keep filtering unexpected paths
  through `.gitignore` or shell out to `git check-ignore`. Rejected because the
  requested policy is based on git-tracked and committed state, not ignore
  matching.
- Query tracked membership only for paths already present in the uncommitted
  delta and merge that result with committed-path deltas before checking
  proposal-path isolation. Alternative considered: scan the full repository
  tracked set after materialization. Restricting the lookup to changed paths
  keeps the logic simpler and preserves the existing delta-based error report.
- Treat tracked unexpected paths uniformly, even under `.codex/` or other
  ignored-looking directories. Alternative considered: preserve special
  treatment for paths that match repository ignore rules. Rejected because a
  tracked path outside the proposal directory is still planner contamination.
- Keep repository-relative POSIX path normalization and the current outside-path
  error format. Alternative considered: change the failure message to mention
  tracked versus committed sources separately. Rejected because the existing
  error text is already stable for regression coverage and user triage.
- Update regression tests as paired behavior checks: untracked residue is
  tolerated, tracked unexpected residue still fails, and the negative case no
  longer depends on `.gitignore` matching. Alternative considered: only adapt
  the happy-path `.codex` test. Rejected because the risk is over-relaxing the
  isolation guard.

## Risks / Trade-offs

- [Untracked residue can remain in the planner worktree] -> This is the
  intended relaxation; tracked and committed outside-path contamination remains
  fatal and is locked down with regression coverage.
- [Tracked-path lookup misses an edge case in the uncommitted delta] -> Use the
  existing normalized changed-path delta as the source set and cover tracked
  `.codex` plus ordinary unexpected-path failures in tests.
- [Committed and tracked path sources diverge] -> Merge the two normalized path
  sets before the isolation check so the guard reasons over one deduplicated
  outside-path list.
- [Dependency removal leaves stale package metadata] -> Remove `ignore` from
  `package.json`, refresh `pnpm-lock.yaml`, and keep validation on `pnpm fmt`,
  `pnpm lint`, targeted planner tests, and `pnpm build`.

## Migration Plan

No user-facing migration is required. This is an internal planner
materialization change that rolls out with the dependency removal, updated
regression coverage, and refreshed OpenSpec artifacts.

## Open Questions

- None.
