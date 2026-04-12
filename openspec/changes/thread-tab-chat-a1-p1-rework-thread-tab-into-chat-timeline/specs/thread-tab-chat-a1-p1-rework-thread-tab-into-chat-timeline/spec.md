## ADDED Requirements

### Requirement: Rework Thread Tab Into Chat Timeline
The system SHALL implement the approved proposal recorded in OpenSpec change `thread-tab-chat-a1-p1-rework-thread-tab-into-chat-timeline`
and keep the work aligned with this proposal's objective: Materialize OpenSpec change `thread-tab-chat-layout` to convert the selected thread detail view into a chat-style timeline, move primary lane quick links into the top header, add bottom-anchored scrolling plus a right-side navigation rail, and implement live-plus-lazy stderr loading with cleanup so long-running threads do not overflow client memory while existing approval and feedback flows remain intact.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Rework Thread Tab Into Chat Timeline" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat: Rework Thread Tab Into Chat Timeline` and conventional-title metadata `feat`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat: Rework Thread Tab Into Chat Timeline`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `thread-tab-chat-a1-p1-rework-thread-tab-into-chat-timeline`
