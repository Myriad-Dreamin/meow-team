## Context

This change captures proposal "Use static worktrees per thread" as OpenSpec change `thread-worktree-a1-p1-use-static-worktrees-per-thread`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Refactor `lib/team/coding/` so each living thread reserves one managed `meow-N` worktree before planning starts, reuses that same worktree across proposal materialization and all lane execution, releases it only when the thread is archived, and replaces `TeamRunEnv.createWorktree` with resolved `Worktree` context plus updated persistence, scheduling, compatibility handling, and regression coverage.
- Preserve a reviewable OpenSpec contract before coding starts.
- Keep the proposal logical enough that any pooled worker can execute it.
- Reuse a managed worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` for cache-friendly execution.

**Non-Goals:**
- Bind this proposal to a specific branch or worker slot before approval.
- Expand scope beyond the approved proposal without human feedback.
- Merge sibling proposals into a single coding pass without replanning.

## Decisions

- Store the proposal as a dedicated OpenSpec change before coding begins.
- Let the pooled coding-review runtime allocate execution branches and worktrees after approval.
- Use planner output as the starting point for reviewer validation and follow-up tasks.
- Prefer incremental implementation that can be requeued after machine review feedback.
- Keep the canonical request/PR title as `refactor: Use static worktrees per thread`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor: Use static worktrees per thread`
- Conventional title metadata: `refactor`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Recommended proposal set: 1 proposal. Proposal: `Use static worktrees per thread` Suggested OpenSpec seed: `static-worktrees-per-thread` Why this stays one proposal: - The worktree lifetime rule, persisted state shape, and `TeamRunEnv` API are tightly coupled. Splitting them would leave scheduling and execution half-migrated. - Planning, approval, coding, review, and final archive currently reconstruct or clear worktree metadata in different places. They need one consistent thread-owned model. Objective: - Refactor `lib/team/coding/` so a thread claims a managed `meow-N` worktree before planner and request-title execution, reuses that same worktree across proposal materialization and all lane runs, and keeps the reservation until `archiveTeamThread` marks the thread archived. - Replace `TeamRunEnv.createWorktree` with explicit resolved `Worktree` values passed from planning and scheduling context into planner, coder, reviewer, and archive flows. Implementation shape: 1. Promote reservation metadata from assignment and lane scope to thread lifetime. Add persisted thread-owned slot/worktree state, keep assignment or lane fields derived or compatibility-only, and preserve legacy records that only have `threadSlot`, `plannerWorktreePath`, or lane `worktreePath`. 2. Move slot claim earlier in planning. `buildPlanningStageState` should resolve the selected repository worktree root, reserve a slot for the thread, and use that resolved `Worktree` for request-title generation, planner execution, and proposal materialization. 3. Simplify scheduling around one active lane per thread. `dispatch-worktrees.ts` and `ensurePendingDispatchWork` should treat the thread reservation as the source of truth, stop releasing or reassigning per-lane worktrees on queued, failed, approved, or completed transitions, and only free the slot on thread archive. 4. Remove the dynamic worktree factory from `TeamRunEnv`. Helpers in `plan.ts`, `reviewing.ts`, `coding.ts`, and related state builders should accept the resolved thread worktree directly or resolve it once per thread run instead of rebuilding it from scattered path fields. 5. Update capacity semantics and errors. A completed but unarchived thread should still occupy its `meow-N`, so new planning runs must count living reserved threads, and owner-facing capacity messaging should reflect archive-as-release behavior. 6. Refresh regression coverage around planning-stage reservation, replan reuse on the same thread, completed-but-unarchived threads still blocking capacity, legacy-state compatibility, and release-on-archive only. Primary code surfaces: - `lib/team/coding/plan.ts` - `lib/team/coding/dispatch-worktrees.ts` - `lib/team/coding/reviewing.ts` - `lib/team/coding/shared.ts` - `lib/team/coding/index.ts` - `lib/team/history.ts` Scope boundaries: - Keep the current `planner -> coder -> reviewer` workflow and the existing one-lane-at-a-time-per-thread execution rule. - Do not broaden this into distributed locking or a general git abstraction rewrite. - Do not edit archived OpenSpec history; materialize a new change and update active spec guidance instead. Assumptions and risks: - Holding slots until archive reduces effective capacity if owners leave completed threads unarchived, so the implementation should make that operational constraint explicit. - Current capacity checks rely on pending non-terminal assignments. The refactor must deliberately move reservation bookkeeping to thread-level storage or an equivalent living-thread index. - Final archive and failure paths currently clear lane worktree metadata in several places. Missing one path would leave runtime and persisted state inconsistent. Validation: - `pnpm fmt` - `pnpm lint` - targeted Vitest coverage for `lib/team/coding/index.test.ts` plus any new or updated scheduling/worktree tests - `pnpm build` because shared orchestration contracts and persisted thread state change Approval note: - Keep the coder/reviewer pool idle until a human approves this single proposal.
