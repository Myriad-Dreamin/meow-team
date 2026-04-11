## Context

This change captures proposal "Standardize Conventional Request and PR Titles" as OpenSpec change `conventional-pr-titles-a1-p1-standardize-conventional-request-and-pr-tit`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Introduce shared conventional-title metadata and formatting across planner/OpenSpec materialization, request-title storage, reviewer/finalization PR handling, and the new PR-title lint workflow, while keeping slash-delimited roadmap/topic scopes separate from `branchPrefix` and OpenSpec change paths.
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

Planner deliverable reference: Single OpenSpec-aligned proposal. Persist explicit conventional-title metadata for type and optional roadmap/topic scope, keep that metadata separate from `branchPrefix`, use it to normalize the canonical request title and final PR title, mirror the scope decision into generated OpenSpec artifacts, and add the requested PR-title lint workflow. Validation should cover request-title formatting, metadata propagation through planning and dispatch, reviewer/finalization PR title behavior, and the new CI workflow. Coding-review lanes remain idle until this proposal is approved.
