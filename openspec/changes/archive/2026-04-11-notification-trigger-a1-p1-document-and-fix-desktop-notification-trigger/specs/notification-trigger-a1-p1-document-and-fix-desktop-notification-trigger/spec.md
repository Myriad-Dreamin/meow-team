## ADDED Requirements

### Requirement: Document and Fix Desktop Notification Triggers

The system SHALL implement the approved proposal recorded in OpenSpec change `notification-trigger-a1-p1-document-and-fix-desktop-notification-trigger`
and keep the work aligned with this proposal's objective: Create `docs/notification.md`, document the exact desktop alert trigger rules and prerequisites, reproduce why notifications are not firing, and repair the client notification flow with regression coverage.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Document and Fix Desktop Notification Triggers" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `fix(desktop/notifications): Document and Fix Desktop Notification Triggers` and conventional-title metadata `fix(desktop/notifications)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `fix(desktop/notifications): Document and Fix Desktop Notification Triggers`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `notification-trigger-a1-p1-document-and-fix-desktop-notification-trigger`
