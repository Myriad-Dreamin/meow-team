## Context

This change captures proposal "Reuse Planner Worktrees With Thread Cap" as OpenSpec change `planner-thread-cap-a1-p1-reuse-planner-worktrees-with-thread-cap`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Replace hashed planner staging worktree paths with a shared `meow-N` slot allocation model, enforce a matching cap on concurrently active non-terminal threads, and cover slot assignment, reuse, release, legacy-state compatibility, and planner/lane collision behavior with tests.
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

Planner deliverable reference: Implement one cohesive change that removes hash-based planner staging worktrees in favor of reusable `meow-N` slots. The approved implementation should add a bounded planner/thread slot allocator, route planner proposal materialization through that shared reusable path model, preserve stable reuse for a non-terminal thread, and return a clear capacity error when all `N` slots are occupied. Keep the rest of the dispatch model as-is unless a narrow compatibility adjustment is required to prevent planner/lane worktree collisions, and prove the behavior with focused scheduling/admission tests.
