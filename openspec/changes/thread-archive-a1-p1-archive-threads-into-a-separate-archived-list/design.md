## Context

This change captures proposal "Archive threads into a separate archived list" as OpenSpec change `thread-archive-a1-p1-archive-threads-into-a-separate-archived-list`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Persist thread archive state, add archive-aware thread summary/status APIs and an archive mutation, then update the workspace so archived threads are hidden from Living Threads and only visible through a revealed archived list beside Settings, with tests and docs updated for the new behavior.
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
- Keep the canonical request/PR title as `feat(threads/archive): Archive threads into a separate archived list`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat(threads/archive)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat(threads/archive): Archive threads into a separate archived list`
- Conventional title metadata: `feat(threads/archive)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Recommended OpenSpec change: `archive-threads-list`. This should ship as one proposal because the storage model, list/status queries, archive action, and workspace navigation all need to agree on the same archive semantics. Implementation scope: - Persist archive state on thread records and expose it through thread summaries. - Make history/status queries archive-aware so living and archived threads are separated before summary limits and counters are calculated. - Add an archive mutation endpoint for a selected thread. - Add a workspace control beside Settings to reveal archived threads and keep archived thread selection/detail views stable under polling. - Update tests and docs for the new archive behavior. Important constraints: - Do not solve this by client-filtering the existing `threads` array; archived threads would still skew the 24-thread limit and the living-thread metrics. - Prefer a v1 guard that only archives inactive threads. - Leave unarchive out of scope unless approval expands the request. Coding/review lanes remain idle until human approval.
