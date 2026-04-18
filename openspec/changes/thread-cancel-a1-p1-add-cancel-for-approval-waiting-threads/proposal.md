## Why

The thread command surface can approve, finalize, or replan an idle latest
assignment, but it cannot explicitly stop a request group that is waiting on
human approval. Owners currently have to leave stale approval waits in place or
use unrelated archive or replan flows, and the existing derived status model
does not preserve a real terminal cancelled state after refresh.

## What Changes

- Materialize OpenSpec change
  `thread-cancel-a1-p1-add-cancel-for-approval-waiting-threads` for proposal
  "Add /cancel for approval-waiting threads".
- Add `/cancel` to the shared thread-command metadata so parser support,
  placeholder text, helper copy, and autocomplete stay aligned from one source.
- Allow `/cancel` only for the latest idle assignment when human approval is
  pending, including proposal approval waits
  (`awaiting_human_approval`) and final approval waits (`approved` lanes whose
  pull requests still await human approval).
- Add a server-side thread-scoped cancellation path that ends the latest
  request group without starting coder, reviewer, or final-archive work.
- Persist an explicit cancelled lifecycle state so refreshed history keeps the
  latest assignment and thread terminal as `Cancelled` instead of drifting back
  to approval-waiting or machine-reviewed derivations.
- Propagate the cancelled terminal state through archive eligibility, status
  labels and pills, task-output and timeline rendering, docs, and focused
  regression coverage.
- Keep `/cancel` thread-scoped rather than per-proposal, block it while any
  latest-assignment lane is queued, coding, or reviewing, and leave archive or
  branch cleanup to the existing inactive-thread archive workflow.

## Capabilities

### New Capabilities

- `thread-cancel-a1-p1-add-cancel-for-approval-waiting-threads`: Add a
  thread-scoped `/cancel` command for idle approval waits, persist a terminal
  cancelled lifecycle state for the latest request group, and render
  `Cancelled` consistently across history, UI, docs, and tests.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `feat(threads/approvals): cancel approval-waiting threads`
- Conventional title metadata: `feat(threads/approvals)`
- Conventional-title scope remains metadata and does not alter `branchPrefix`
  or the OpenSpec change path.

## Impact

- Affected repository: `meow-team`
- Expected implementation surfaces: `lib/team/thread-command.ts`,
  `lib/team/thread-command-server.ts`, `lib/team/thread-actions.ts`,
  `lib/team/history.ts`, `lib/team/types.ts`, `lib/team/notifications.ts`,
  `components/thread-command-composer.tsx`, `components/thread-view-utils.ts`,
  `components/team-thread-status.ts`, `components/team-status-bar-lane-utils.ts`,
  `components/agent-task-output-window.tsx`,
  `docs/api/team/threads/threadId/command.md`, `docs/notification.md`, and
  focused thread-command or history UI tests
- No new external dependency is expected; the change is lifecycle and UI
  plumbing across existing team modules
- Planner deliverable alignment: keep this as one proposal because command
  metadata, cancellation persistence, terminal-state routing, docs, and tests
  all depend on the same cancelled lifecycle contract
- Coding-review execution remains pooled and idle until a human approves this
  single proposal
