## Why

Repository-backed threads currently rely on a planning-stage workaround that
re-prepares the same managed `meow-N` slot each time `runTeam` advances between
request-title, planner, and metadata-generation stages. That obscures the real
thread worktree lifecycle, makes resume and replan behavior harder to reason
about, and leaves archive-time release semantics implicit even though each
living thread is supposed to own at most one managed slot.

## What Changes

- Replace repeated stage-local planning worktree preparation in
  `lib/team/coding/plan.ts` with a single thread-scoped readiness flow that
  resolves, claims, and prepares one managed `meow-N` worktree before
  planner-side agent work starts.
- Reuse the same claimed slot across planning, resume, replanning, proposal
  approval, coding, review, and final archive paths; only claim a new slot when
  the thread has no surviving assignment-backed worktree.
- Persist the prepared worktree back into thread state so later `runTeam` entry
  paths can rely on the same slot without replaying workaround logic.
- Keep planner-to-lane handoff on the same thread-owned slot and make archiving
  an inactive thread release the live claim without treating archived historical
  slot metadata as active ownership.
- Update lifecycle regression coverage in `lib/team/coding/index.test.ts` and
  `lib/team/history.test.ts` to assert one-slot reuse, concurrent blocking,
  resume or replan reuse, and archive release behavior.

## Capabilities

### New Capabilities
- `thread-worktree-a1-p1-unify-thread-worktree-lifecycle`: Define one
  repository-backed lifecycle for claiming, preparing, reusing, and releasing a
  managed thread worktree across planning, approval, execution, and archive.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `fix(thread/worktree): unify thread worktree lifecycle`
- Conventional title metadata: `fix(thread/worktree)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code paths: `lib/team/coding/plan.ts`,
  `lib/team/coding/thread-worktree.ts`, `lib/team/history.ts`,
  `lib/team/coding/index.test.ts`, and `lib/team/history.test.ts`
- Systems affected: repository-backed planner execution, the managed worktree
  pool under `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees`, and
  archive-time release of living-thread capacity
