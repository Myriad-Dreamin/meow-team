## Context

`lib/team/coding/plan.ts` currently works around missing planner checkouts by
calling `ensureLaneWorktree()` from `buildPlanningStageState`,
`runPlanningStage`, and `runMetadataGenerationStage`. Those repeated
`preparePlanningWorktree` calls prepare the same claimed slot multiple times
even though `threadWorktree` is already persisted in thread state,
`claimTeamThreadWorktree()` already serializes slot claims through thread
storage, `resolveThreadOwnedWorktree()` can recover older assignment metadata,
and `archiveTeamThread()` already clears `threadWorktree` on archive. The gap is
that checkout readiness is still stage-local instead of thread-scoped, so the
system behaves like a workaround rather than a single lifecycle.

## Goals / Non-Goals

**Goals:**
- Establish one repository-backed readiness helper that resolves or claims the
  thread-owned worktree and prepares its checkout before agent work begins.
- Reuse the same slot across planning, resumes, replans, approval, coding,
  review, and final archive without introducing a second planner-only workspace.
- Persist the prepared worktree in thread state so later entry paths can rely
  on explicit ownership instead of replaying workaround logic.
- Keep archive release explicit: archiving an inactive thread frees the live
  claim while archived historical slot or path metadata no longer participates
  in active claim resolution.
- Replace workaround-oriented tests with lifecycle invariants.

**Non-Goals:**
- Changing the configured workflow `planner -> coder -> reviewer`.
- Altering lane branch naming, PR behavior, or reviewer and archive semantics
  beyond consuming the preprepared thread-owned worktree.
- Expanding storage exclusivity beyond the existing thread-store mutation
  boundary.
- Introducing concurrent multi-slot execution within a single thread.

## Decisions

1. Build a single thread worktree readiness path for repository-backed runs.
   Rationale: one helper can resolve an existing thread-owned slot, claim one
   when needed, and prepare the checkout at the point where `runTeam` decides
   work can proceed. This removes the need for each planner-side stage to rerun
   `ensureLaneWorktree()`.
   Alternatives considered:
   - Keep `preparePlanningWorktree` in every stage. Rejected because it
     preserves the workaround and keeps lifecycle semantics dependent on stage
     boundaries.
   - Prepare only on proposal approval. Rejected because request-title and
     planner Codex runs still need a real checkout before they can `--cd` into
     the managed slot.

2. Treat `threadWorktree` as the live source of ownership, with assignment and
   lane metadata as recovery inputs.
   Rationale: persisted thread state makes resume and replan flows
   deterministic, while `resolveThreadOwnedWorktree()` can still recover older
   records that only have `threadSlot`, `plannerWorktreePath`, or lane worktree
   fields.
   Alternatives considered:
   - Reconstruct ownership from assignments every time. Rejected because
     archive-time release becomes indirect and the active claim is harder to
     reason about.
   - Drop legacy recovery. Rejected because non-archived threads may already
     exist with older metadata shapes.

3. Preserve the same claimed slot through planner-to-lane handoff and final
   archive.
   Rationale: approved work already expects the thread-owned slot to be
   reusable; claiming a second implementation slot would violate the
   one-thread/one-slot invariant and reduce pool capacity.
   Alternatives considered:
   - Split planning and coding into separate managed worktrees. Rejected because
     it reintroduces duplicate ownership and expands migration complexity.

4. Make archive the only point that releases live slot ownership.
   Rationale: a completed, failed, or superseded living thread should still
   block reuse of its slot until a human archives it. `archiveTeamThread()`
   already clears `threadWorktree`; the implementation should ensure active
   claim resolution ignores archived threads even if archived assignments retain
   historical slot or path data.
   Alternatives considered:
   - Release on lane completion. Rejected because resumed or approved follow-up
     work would lose the thread-owned workspace.
   - Scrub all archived assignment metadata. Rejected because audit trails can
     remain useful as long as archived records are excluded from live claims.

5. Rewrite regression coverage around lifecycle behavior, not repeated checkout
   side effects.
   Rationale: the contract is "one claimed slot prepared once and reused until
   archive," not "planner stages each call `ensureLaneWorktree()`." Tests should
   assert serialized claims, reuse on resume or replan, blocking of concurrent
   second threads, and release on archive.

## Conventional Title

- Canonical request/PR title: `fix(thread/worktree): unify thread worktree lifecycle`
- Conventional title metadata: `fix(thread/worktree)`

## Risks / Trade-offs

- [Concurrent planner starts race on the same pool] -> Keep slot assignment
  inside `claimTeamThreadWorktree()` storage mutation and ensure any new
  readiness helper uses that serialized claim path.
- [Legacy non-archived threads have partial slot metadata] -> Normalize through
  `resolveThreadOwnedWorktree()` and cover fallback recovery in tests before
  removing the workaround.
- [Approval or archive paths accidentally claim a fresh slot] -> Route all
  repository-backed entry paths through the persisted `threadWorktree` and fail
  tests if a second claim occurs.
- [Archived records still appear as active owners] -> Exclude archived threads
  from live claim collection and keep archive-release assertions in
  `lib/team/history.test.ts`.

## Migration Plan

- Introduce the thread-scoped readiness helper and switch planner-side entry
  points to use it instead of repeated stage-local preparation.
- Preserve backward compatibility by resolving existing assignment or lane
  metadata into `threadWorktree` on first reuse.
- Rollback remains low risk: the old repeated `preparePlanningWorktree` pattern
  can be restored if a readiness regression appears before release.

## Open Questions

- None. Implementation should follow the serialized thread-store claim model
  that already exists.
