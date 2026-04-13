# thread-tab-nav-a1-p1-make-thread-tab-navigation-rail-scrollable Specification

## Purpose

Define the selected thread tab's right-side navigation rail behavior so dense
anchor lists remain independently scrollable while the rail stays sticky on
desktop, capped on smaller screens, and aligned with active-anchor navigation.

## Requirements

### Requirement: Make thread tab navigation rail scrollable

The system SHALL implement the approved proposal recorded in OpenSpec change `thread-tab-nav-a1-p1-make-thread-tab-navigation-rail-scrollable`
and keep the work aligned with this proposal's objective: Materialize an OpenSpec change for the selected thread tab's right-side navigation rail: update the thread-detail rail layout so long anchor lists get an independent scroll region, preserve sticky and active-anchor behavior across desktop and narrow breakpoints, and validate usability with a dense timeline without changing thread data or left-sidebar behavior.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Make thread tab navigation rail scrollable" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `fix: Make thread tab navigation rail scrollable` and conventional-title metadata `fix`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `fix: Make thread tab navigation rail scrollable`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `thread-tab-nav-a1-p1-make-thread-tab-navigation-rail-scrollable`
