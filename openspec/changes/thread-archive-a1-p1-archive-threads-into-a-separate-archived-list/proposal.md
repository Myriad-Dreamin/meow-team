## Why

Persist thread archive state, add archive-aware thread summary/status APIs and an archive mutation, then update the workspace so archived threads are hidden from Living Threads and only visible through a revealed archived list beside Settings, with tests and docs updated for the new behavior. Implement end-to-end thread archiving with separate living and archived workspace lists. This proposal is one candidate implementation for the request: Allow archiving threads. If a thread is archived, it should be hidden from the living thread list, and can only be viewed in the archived thread list. The archived thread list can be revealed when the user clicks the "Show archived threads" button, like and alongside the `setting` fontawesome button.

## What Changes

- Introduce the `thread-archive-a1-p1-archive-threads-into-a-separate-archived-list` OpenSpec change for proposal "Archive threads into a separate archived list".
- Persist thread archive state, add archive-aware thread summary/status APIs and an archive mutation, then update the workspace so archived threads are hidden from Living Threads and only visible through a revealed archived list beside Settings, with tests and docs updated for the new behavior.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `thread-archive-a1-p1-archive-threads-into-a-separate-archived-list`: Persist thread archive state, add archive-aware thread summary/status APIs and an archive mutation, then update the workspace so archived threads are hidden from Living Threads and only visible through a revealed archived list beside Settings, with tests and docs updated for the new behavior.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(threads/archive): Archive threads into a separate archived list`
- Conventional title metadata: `feat(threads/archive)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Recommended OpenSpec change: `archive-threads-list`. This should ship as one proposal because the storage model, list/status queries, archive action, and workspace navigation all need to agree on the same archive semantics. Implementation scope: - Persist archive state on thread records and expose it through thread summaries. - Make history/status queries archive-aware so living and archived threads are separated before summary limits and counters are calculated. - Add an archive mutation endpoint for a selected thread. - Add a workspace control beside Settings to reveal archived threads and keep archived thread selection/detail views stable under polling. - Update tests and docs for the new archive behavior. Important constraints: - Do not solve this by client-filtering the existing `threads` array; archived threads would still skew the 24-thread limit and the living-thread metrics. - Prefer a v1 guard that only archives inactive threads. - Leave unarchive out of scope unless approval expands the request. Coding/review lanes remain idle until human approval.
