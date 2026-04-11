## Why

Replace hashed planner staging worktree paths with a shared `meow-N` slot allocation model, enforce a matching cap on concurrently active non-terminal threads, and cover slot assignment, reuse, release, legacy-state compatibility, and planner/lane collision behavior with tests. Reuse shared `meow-N` planner worktrees and cap concurrent active threads to that same slot budget. This proposal is one candidate implementation for the request: Currently the planner's worktree contains hashes, this violates the principle of reusing worktrees across threads. since there are at most `N` threads as configured. planner could be run in one of the prepared `meow-N`, sharing with other agents. Note, therefore, we should ensure that no more than `N` threads are running at the same time.

## What Changes

- Introduce the `planner-thread-cap-a1-p1-reuse-planner-worktrees-with-thread-cap` OpenSpec change for proposal "Reuse Planner Worktrees With Thread Cap".
- Replace hashed planner staging worktree paths with a shared `meow-N` slot allocation model, enforce a matching cap on concurrently active non-terminal threads, and cover slot assignment, reuse, release, legacy-state compatibility, and planner/lane collision behavior with tests.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `planner-thread-cap-a1-p1-reuse-planner-worktrees-with-thread-cap`: Replace hashed planner staging worktree paths with a shared `meow-N` slot allocation model, enforce a matching cap on concurrently active non-terminal threads, and cover slot assignment, reuse, release, legacy-state compatibility, and planner/lane collision behavior with tests.

### Modified Capabilities
- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Implement one cohesive change that removes hash-based planner staging worktrees in favor of reusable `meow-N` slots. The approved implementation should add a bounded planner/thread slot allocator, route planner proposal materialization through that shared reusable path model, preserve stable reuse for a non-terminal thread, and return a clear capacity error when all `N` slots are occupied. Keep the rest of the dispatch model as-is unless a narrow compatibility adjustment is required to prevent planner/lane worktree collisions, and prove the behavior with focused scheduling/admission tests.
