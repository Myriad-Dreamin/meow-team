## Context

This change captures proposal "Link lane commit activity to GitHub" as OpenSpec change `commit-links-a1-p1-link-lane-commit-activity-to-github`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Update dispatch commit-related activity/event messages to emit explicit markdown links when a GitHub commit URL exists, render those messages safely in the thread UI with `markdown-it`, and cover the behavior with regression tests without regex-based auto-linking.
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
- Keep the canonical request/PR title as `feat(lane/commits): Link lane commit activity to GitHub`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat(lane/commits)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat(lane/commits): Link lane commit activity to GitHub`
- Conventional title metadata: `feat(lane/commits)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal: `Link Lane Commit References in Activity Feeds` Suggested OpenSpec seed: `link-lane-commit-references` Objective: make commit hashes inside lane activity and event messages clickable GitHub links by generating explicit markdown at the dispatch layer and rendering that markdown safely in the thread UI. Why this is one proposal: - Backend message generation and frontend rendering are tightly coupled. - Splitting them would create an intermediate state where raw markdown is persisted but not rendered, or rendering is added without deterministic link data. Execution outline: 1. Make commit message formatting URL-aware in `lib/team/dispatch.ts` so pushed commits become explicit markdown links and non-pushed review commits stay plain text. 2. Update only the commit-related activity/event strings that currently use `shortenCommit`. 3. Introduce a shared, safe markdown renderer for lane activity/event text and wire it into the status-board and detail-panel lane feeds. 4. Preserve the existing structured commit/branch displays outside the activity feed. 5. Add regression tests for dispatch formatting and UI rendering, then run `pnpm fmt`, `pnpm lint`, and relevant tests/build checks as feasible. Approval notes: - This should be materialized as a single OpenSpec change. - The coder/reviewer pool should remain idle until human approval arrives.
