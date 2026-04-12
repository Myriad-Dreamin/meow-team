## Context

This change captures proposal "Refactor team execution storage modules" as OpenSpec change `storage-refactor-a1-p1-refactor-team-execution-storage-modules`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Create the OpenSpec-backed change `refactor-team-execution-storage` to move `lib/team/storage.ts` into `lib/storage/`, split generic SQLite setup from thread-specific persistence APIs, update affected runtime imports, and convert team execution tests to SQLite-backed fixtures while preserving explicit coverage for legacy JSON import behavior.
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
- Keep the canonical request/PR title as `refactor(team/storage): Refactor team execution storage modules`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor(team/storage)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor(team/storage): Refactor team execution storage modules`
- Conventional title metadata: `refactor(team/storage)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal 1: Refactor Team Execution Storage Modules Change slug: `refactor-team-execution-storage` Why: the SQLite backend already exists, but team execution storage is still organized under `lib/team/storage.ts` and several tests still seed legacy JSON stores, which means structure and test setup lag behind the runtime model. Execution plan: - Extract shared SQLite concerns into `lib/storage`. - Isolate thread-domain behavior in `lib/storage/thread.ts`. - Repoint runtime imports away from `lib/team/storage.ts`. - Replace JSON-seeded fixtures in `dispatch-approval.test.ts` and the non-import paths in `history.test.ts` with SQLite-backed helpers. - Preserve one explicit legacy JSON import test so backward compatibility remains covered. Approval risks: - Connection caching and serialized writes must remain stable after the split. - The refactor should not silently drop legacy import coverage or change thread normalization behavior. - Structural import changes should be validated with the standard repo checks before merge. Coding-review lanes remain idle until human approval.
