## Why

Implement one OpenSpec-aligned change that gives each planner assignment its own staging worktree, assigns coder/reviewer worktree slots from the shared cross-thread pool, preserves slot reuse for active lanes, and adds regression coverage for concurrent runs. One proposal: fix parallel planner and coder/reviewer worktree allocation so shared worktrees are claimed uniquely across concurrent threads. This proposal is one candidate implementation for the request: Correctly assign and checkout worktrees. When runs multiple threads at the same time, they are assigned to the same worktree, which causes conflicts. 1. the planners are all on "planner-staging" worktree 2. the coders are all on "meow-1" worktree.

## What Changes

- Introduce the `parallel-worktrees-a1-p1-fix-parallel-worktree-allocation` OpenSpec change for proposal "Fix Parallel Worktree Allocation".
- Implement one OpenSpec-aligned change that gives each planner assignment its own staging worktree, assigns coder/reviewer worktree slots from the shared cross-thread pool, preserves slot reuse for active lanes, and adds regression coverage for concurrent runs.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `parallel-worktrees-a1-p1-fix-parallel-worktree-allocation`: Implement one OpenSpec-aligned change that gives each planner assignment its own staging worktree, assigns coder/reviewer worktree slots from the shared cross-thread pool, preserves slot reuse for active lanes, and adds regression coverage for concurrent runs.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Fix Parallel Worktree Allocation` Suggested OpenSpec seed: `parallel-worktrees-a1-p1-fix-parallel-worktree-allocation` Objective: stop parallel runs from checking out the same managed worktree during both proposal materialization and coder/reviewer execution. Implementation shape: 1. Replace the singleton planner staging path with an assignment-scoped planner worktree path derived from stable request identity such as `threadId` plus `assignmentNumber`, so concurrent planner runs no longer share `.meow-team-worktrees/planner-staging`. 2. Treat `teamConfig.dispatch.workerCount` as one shared coder/reviewer pool across all pending threads. Move slot arbitration to a global pass over `listPendingDispatchAssignments` so only one active lane at a time can claim each `meow-N` worktree. 3. Preserve current reuse semantics for active lanes: once a lane owns slot `N`, keep that slot and worktree through coding, reviewing, and requeues until the lane leaves the pool-occupying states. 4. Keep the change focused on dispatch and worktree coordination surfaces, likely `lib/team/git.ts`, `lib/team/openspec.ts`, `lib/team/dispatch.ts`, plus new regression tests for planner-path generation and cross-thread slot assignment. 5. Acceptance target: concurrent planner runs use different staging worktrees; concurrent approved lanes never share the same `meow-N`; total active coding/review lanes across all threads never exceeds configured `workerCount`; existing single-thread worktree reuse still behaves the same. 6. Validation target: add targeted Vitest coverage for multi-thread slot allocation and planner worktree naming, then run `pnpm lint`; run `pnpm build` before handoff if the implementation crosses integration boundaries. Scope boundaries and risks: - Assume dispatch coordination remains in the existing app process and thread-store mutation flow; do not broaden this into distributed multi-host locking. - Keep the proposal centered on worktree and slot allocation. Only widen into branch or OpenSpec naming changes if implementation proves those identifiers also collide under the same parallel-thread scenario. - This is one coherent proposal. Coding-review lanes should stay idle until a human approval arrives.
