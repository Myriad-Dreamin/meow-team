## Why

Create `docs/notification.md`, document the exact desktop alert trigger rules and prerequisites, reproduce why notifications are not firing, and repair the client notification flow with regression coverage. Single proposal to document desktop alert behavior and repair the client trigger path so approval and failure notifications fire reliably. This proposal is one candidate implementation for the request: Notification is not triggered: - first document in the `docs/notification.md` to let me know in which case the notification should be triggered. - again check the reason why notification is not triggered, and fix it.

## What Changes

- Introduce the `notification-trigger-a1-p1-document-and-fix-desktop-notification-trigger` OpenSpec change for proposal "Document and Fix Desktop Notification Triggers".
- Create `docs/notification.md`, document the exact desktop alert trigger rules and prerequisites, reproduce why notifications are not firing, and repair the client notification flow with regression coverage.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `notification-trigger-a1-p1-document-and-fix-desktop-notification-trigger`: Create `docs/notification.md`, document the exact desktop alert trigger rules and prerequisites, reproduce why notifications are not firing, and repair the client notification flow with regression coverage.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `fix(desktop/notifications): Document and Fix Desktop Notification Triggers`
- Conventional title metadata: `fix(desktop/notifications)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Document and Fix Desktop Notification Triggers` Objective: add a notification guide and fix the current frontend alert flow. Implementation should create `docs/notification.md`, document when alerts should and should not fire, verify the broken path in the workspace notification effect, adjust the trigger and dedupe logic so documented approval and failure states notify correctly, and add regression coverage plus full repo validation. Key boundaries: keep the work limited to browser desktop notifications, existing attention-needed states, and docs discoverability; do not expand into background delivery or new notification channels. Investigation should start in `components/team-workspace.tsx` and `components/thread-attention-utils.ts`, with the current fingerprint seeding and persistence behavior treated as the leading suspected cause until reproduced.
