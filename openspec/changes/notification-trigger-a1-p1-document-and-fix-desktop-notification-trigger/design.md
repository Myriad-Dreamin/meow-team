## Context

This change captures proposal "Document and Fix Desktop Notification Triggers" as OpenSpec change `notification-trigger-a1-p1-document-and-fix-desktop-notification-trigger`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Create `docs/notification.md`, document the exact desktop alert trigger rules and prerequisites, reproduce why notifications are not firing, and repair the client notification flow with regression coverage.
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
- Keep the canonical request/PR title as `fix(desktop/notifications): Document and Fix Desktop Notification Triggers`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `fix(desktop/notifications)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `fix(desktop/notifications): Document and Fix Desktop Notification Triggers`
- Conventional title metadata: `fix(desktop/notifications)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal: `Document and Fix Desktop Notification Triggers` Objective: add a notification guide and fix the current frontend alert flow. Implementation should create `docs/notification.md`, document when alerts should and should not fire, verify the broken path in the workspace notification effect, adjust the trigger and dedupe logic so documented approval and failure states notify correctly, and add regression coverage plus full repo validation. Key boundaries: keep the work limited to browser desktop notifications, existing attention-needed states, and docs discoverability; do not expand into background delivery or new notification channels. Investigation should start in `components/team-workspace.tsx` and `components/thread-attention-utils.ts`, with the current fingerprint seeding and persistence behavior treated as the leading suspected cause until reproduced.
