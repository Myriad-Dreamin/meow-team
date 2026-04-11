## ADDED Requirements

### Requirement: Link lane commit activity to GitHub
The system SHALL implement the approved proposal recorded in OpenSpec change `commit-links-a1-p1-link-lane-commit-activity-to-github`
and keep the work aligned with this proposal's objective: Update dispatch commit-related activity/event messages to emit explicit markdown links when a GitHub commit URL exists, render those messages safely in the thread UI with `markdown-it`, and cover the behavior with regression tests without regex-based auto-linking.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Link lane commit activity to GitHub" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat(lane/commits): Link lane commit activity to GitHub` and conventional-title metadata `feat(lane/commits)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(lane/commits): Link lane commit activity to GitHub`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `commit-links-a1-p1-link-lane-commit-activity-to-github`
