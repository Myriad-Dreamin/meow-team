## Context

This change captures proposal "Default New Request Repository to Top Suggestion" as OpenSpec change `request-repo-default-a1-p1-default-new-request-repository-to-top-suggest`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Implement New Request repository defaulting so the form selects the first suggested repository when available, preserves explicit user overrides and rerun-provided repository ids, keeps manual blank selection available, and adds regression coverage for refresh and fallback behavior.
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
- Keep the canonical request/PR title as `fix: Default New Request Repository to Top Suggestion`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `fix` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `fix: Default New Request Repository to Top Suggestion`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposed single change: make the New Request repository field default to the highest-ranked suggested repository, using the existing suggestion order from the repository picker model. Execution boundaries - Touch only the New Request selection behavior and its regression coverage. - Do not alter suggestion generation, history collection, or repository dispatch rules. - Keep `No repository selected` as a valid manual choice. Implementation notes - Seed the form from the first suggested repository instead of an unconditional empty string. - Add safe reconciliation for picker refreshes so empty or invalid state can recover to the top suggestion, but explicit user selections are preserved. - Leave rerun flows that already pass a concrete `repositoryId` unchanged. - Add tests for defaulting and non-overwrite behavior so the polling workspace update path stays stable. Approval risk to watch The main failure mode is unintentionally reselecting the suggested repository after the user changes the field. The approved implementation should explicitly guard against that.
