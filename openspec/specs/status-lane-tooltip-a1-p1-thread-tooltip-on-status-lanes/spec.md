# status-lane-tooltip-a1-p1-thread-tooltip-on-status-lanes Specification

## Purpose

Define the workspace status-lane tooltip capability that lets each non-zero
lane pill reveal the matching living threads and switch directly to the
selected thread tab without changing existing status-bar polling or controls.

## Requirements

### Requirement: Status-lane pills reveal matching living threads

The system SHALL render each non-zero status pill in
`.workspace-status-lane-list` as an interactive trigger that can reveal the
living threads whose `workerLanes` currently contribute to that lane status.

#### Scenario: Hover, focus, or click opens the matching thread list

- **WHEN** the workspace status bar renders a non-zero lane pill for a living
  lane status
- **THEN** the pill SHALL be reachable by hover, focus, and click
- **AND** activating the pill SHALL open a compact tooltip-style popover for
  that status
- **AND** the popover SHALL list only living threads with one or more
  matching lane contributions

### Requirement: Tooltip rows explain duplicate lane contributions

The system SHALL preserve same-thread multiplicity when one living thread
contributes more than once to the same status-lane pill.

#### Scenario: One thread owns multiple matching lanes

- **WHEN** a living thread has two or more `workerLanes` with the same status
- **THEN** the popover SHALL render one row for that thread instead of
  duplicating the title
- **AND** the row SHALL include enough context to explain the repeated
  contribution to the aggregate pill count

### Requirement: Lane popovers can switch to the matching thread tab

The system SHALL let the owner jump from a lane-status popover directly to the
corresponding living thread tab by reusing the existing workspace tab
selection flow.

#### Scenario: Clicking a row selects the thread tab

- **WHEN** the owner activates a thread row inside a lane-status popover
- **THEN** the workspace SHALL switch to that thread's tab using the existing
  thread selection handler
- **AND** the lane-status popover SHALL dismiss after the selection

### Requirement: Existing status-bar behavior stays intact

The system SHALL keep the current status-bar controls and polling behavior
intact while excluding archived threads from the lane-tooltip interaction.

#### Scenario: Archived threads remain out of scope

- **WHEN** archived threads exist in the workspace
- **THEN** the settings button, archived-thread toggle, and host telemetry
  polling SHALL behave as before
- **AND** archived threads SHALL not appear in any lane-status popover

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed
implementation branch and reusable worktree until human feedback explicitly
requests request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a
  reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: show lane thread tooltips` and conventional-title metadata `feat`
through the materialized OpenSpec artifacts without encoding slash-delimited
roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat: show lane thread tooltips`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata
  instead of changing the proposal change path
  `status-lane-tooltip-a1-p1-thread-tooltip-on-status-lanes`
