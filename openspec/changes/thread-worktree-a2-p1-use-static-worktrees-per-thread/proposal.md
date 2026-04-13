## Why

Refactor `lib/team/coding` so each living repository-backed thread claims one managed `meow-N` worktree before planning, persists that resolved `Worktree` across planning, proposal materialization, coding, review, final archive, and replanning, removes dynamic `createWorktree` usage from the run env and stage transitions, releases the slot only when the thread is archived, and updates legacy compatibility plus regression coverage for the new thread-scoped lifecycle. Make worktree ownership thread-scoped, keep one resolved `Worktree` per living thread through all coding states, and release the slot only on thread archive. This proposal is one candidate implementation for the request: Refactor `/lib/team/coding/`: For all of the state, assign a worktree for a thread to run first. the worktree is occupied until the thread is archived. With this assumption, env can store a static `Worktree` rather than a dynamic resolved `createWorktree` and hence simplify code.

## What Changes

- Introduce the `thread-worktree-a2-p1-use-static-worktrees-per-thread` OpenSpec change for proposal "Use static worktrees per thread".
- Refactor `lib/team/coding` so each living repository-backed thread claims one managed `meow-N` worktree before planning, persists that resolved `Worktree` across planning, proposal materialization, coding, review, final archive, and replanning, removes dynamic `createWorktree` usage from the run env and stage transitions, releases the slot only when the thread is archived, and updates legacy compatibility plus regression coverage for the new thread-scoped lifecycle.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `thread-worktree-a2-p1-use-static-worktrees-per-thread`: Refactor `lib/team/coding` so each living repository-backed thread claims one managed `meow-N` worktree before planning, persists that resolved `Worktree` across planning, proposal materialization, coding, review, final archive, and replanning, removes dynamic `createWorktree` usage from the run env and stage transitions, releases the slot only when the thread is archived, and updates legacy compatibility plus regression coverage for the new thread-scoped lifecycle.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor: Use static worktrees per thread`
- Conventional title metadata: `refactor`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Regenerated proposal set for the updated direction. Objective - Move worktree ownership from assignment/lane scheduling to the living thread itself. - Claim one managed `meow-N` worktree before planning starts for repository-backed threads, reuse the same resolved `Worktree` through planning, proposal materialization, coding, review, final archive, and replanning, and release it only when the thread is archived. Implementation shape 1. Add thread-scoped worktree metadata plus helpers that can claim, normalize, and recover a slot from existing assignment and lane fields; update capacity checks so living unarchived threads that still own a worktree consume the pool. 2. Refactor `lib/team/coding` stage and env contracts so runs carry a static `Worktree` instead of a dynamic `TeamRunEnv.createWorktree`; planning, dispatch materialization, lane execution, and final archive should all consume the thread-owned worktree directly. 3. Simplify scheduler bookkeeping so lane state no longer allocates and releases dynamic worktree paths between phases; preserve the current one-active-lane-per-thread invariant, keep branch/PR/archive flow unchanged, and make thread archive the only release point. 4. Add regression coverage for legacy-state migration, replanning reuse, completed-but-unarchived capacity blocking, archive-triggered release, resume paths, and the coding/review/archive flows that currently clear worktree metadata. Scope boundaries - Keep the configured workflow `planner -> coder -> reviewer` and the current human approval plus final archive flow. - Do not introduce concurrent proposal execution within a single thread; one thread still owns one reusable worktree. - Preserve no-repository planning behavior; the static worktree requirement applies to repository-backed execution. Risks and assumptions - Living completed, failed, or superseded threads will now keep consuming a slot until archive; that is an intentional behavioral change, so capacity checks and user-facing error text must be updated accordingly. - Existing non-archived records may only have `assignment.threadSlot`, `plannerWorktreePath`, or `lane.worktreePath`; migration must reconstruct the thread worktree deterministically instead of forcing manual cleanup. - Because archive becomes the release trigger, the release helper must live with thread archival rather than assignment completion. Approval note - One proposal is sufficient. The coding-review pool should stay idle until a human approves it.
