## Context

This change captures proposal "Fix Parallel Worktree Allocation" as OpenSpec change `parallel-worktrees-a1-p1-fix-parallel-worktree-allocation`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Implement one OpenSpec-aligned change that gives each planner assignment its own staging worktree, assigns coder/reviewer worktree slots from the shared cross-thread pool, preserves slot reuse for active lanes, and adds regression coverage for concurrent runs.
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

## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal: `Fix Parallel Worktree Allocation` Suggested OpenSpec seed: `parallel-worktrees-a1-p1-fix-parallel-worktree-allocation` Objective: stop parallel runs from checking out the same managed worktree during both proposal materialization and coder/reviewer execution. Implementation shape: 1. Replace the singleton planner staging path with an assignment-scoped planner worktree path derived from stable request identity such as `threadId` plus `assignmentNumber`, so concurrent planner runs no longer share `.meow-team-worktrees/planner-staging`. 2. Treat `teamConfig.dispatch.workerCount` as one shared coder/reviewer pool across all pending threads. Move slot arbitration to a global pass over `listPendingDispatchAssignments` so only one active lane at a time can claim each `meow-N` worktree. 3. Preserve current reuse semantics for active lanes: once a lane owns slot `N`, keep that slot and worktree through coding, reviewing, and requeues until the lane leaves the pool-occupying states. 4. Keep the change focused on dispatch and worktree coordination surfaces, likely `lib/team/git.ts`, `lib/team/openspec.ts`, `lib/team/dispatch.ts`, plus new regression tests for planner-path generation and cross-thread slot assignment. 5. Acceptance target: concurrent planner runs use different staging worktrees; concurrent approved lanes never share the same `meow-N`; total active coding/review lanes across all threads never exceeds configured `workerCount`; existing single-thread worktree reuse still behaves the same. 6. Validation target: add targeted Vitest coverage for multi-thread slot allocation and planner worktree naming, then run `pnpm lint`; run `pnpm build` before handoff if the implementation crosses integration boundaries. Scope boundaries and risks: - Assume dispatch coordination remains in the existing app process and thread-store mutation flow; do not broaden this into distributed multi-host locking. - Keep the proposal centered on worktree and slot allocation. Only widen into branch or OpenSpec naming changes if implementation proves those identifiers also collide under the same parallel-thread scenario. - This is one coherent proposal. Coding-review lanes should stay idle until a human approval arrives.
