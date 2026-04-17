## ADDED Requirements

### Requirement: Audit status-lane tooltip thread jump

The system SHALL implement the approved proposal recorded in OpenSpec change
`status-lane-jump-a1-p1-audit-status-lane-tooltip-thread-jump` and keep the
work aligned with this proposal's objective: treat the request as a regression
follow-up, reproduce any current gap in the existing status-lane popover flow,
then apply only the targeted fixes needed so non-zero lane pills reveal the
matching living threads and clicking a thread row reuses the existing
thread-tab navigation path while dismissing the popover; add focused
interaction coverage and leave broader status-bar behavior unchanged.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Audit status-lane tooltip thread jump"
  proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and
  machine-review workflow

### Requirement: Existing lane popovers restore matching thread jumps

The system SHALL preserve the existing `TeamWorkspace` thread-selection path
and current lane bucketing behavior while ensuring each non-zero status-lane
pill in `.workspace-status-lane-list` continues to reveal the matching living
threads and lets the owner jump to the selected thread tab from the popover.

#### Scenario: Non-zero lane pill reveals matching living threads

- **WHEN** the workspace status bar renders a non-zero lane pill
- **THEN** hover, focus, and click SHALL each be able to reveal the pill's
  popover
- **AND** the popover SHALL list only living threads whose current lane
  contributions match that status
- **AND** rows SHALL preserve same-thread multiplicity context when one thread
  contributes multiple matching lanes

#### Scenario: Activating a row switches to the matching thread tab

- **WHEN** the owner activates a thread row inside an open lane-status popover
- **THEN** the workspace SHALL switch to that thread through the existing
  thread-tab selection flow
- **AND** the lane-status popover SHALL dismiss after the selection

### Requirement: Status-lane regression coverage stays focused

The codebase SHALL add focused rendered interaction coverage for the
status-lane popover flow so regressions in trigger behavior, matching-thread
filtering, multiplicity copy, or row-click dismissal/navigation fail before
the work is treated as complete.

#### Scenario: Popover interaction regressions fail the relevant test suite

- **WHEN** hover, focus, or click reveal behavior regresses, a popover shows
  the wrong living threads, multiplicity context disappears, or clicking a row
  no longer dismisses the panel and switches threads
- **THEN** the relevant rendered status-bar interaction coverage SHALL fail

### Requirement: Existing status-bar behavior stays intact

The system SHALL leave settings, archived-thread reveal, host telemetry
polling, and archived-thread exclusion unchanged while repairing the
status-lane thread-jump flow.

#### Scenario: Non-navigation status-bar behavior remains unchanged

- **WHEN** the regression fix is applied
- **THEN** the settings button, archived-thread toggle, and host telemetry
  polling SHALL behave as before
- **AND** archived threads SHALL remain excluded from lane-status popovers

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
`fix(workspace/status-bar): restore status lane thread links` and
conventional-title metadata `fix(workspace/status-bar)` through the
materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic
scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `fix(workspace/status-bar): restore status lane thread links`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata
  instead of changing the proposal change path
  `status-lane-jump-a1-p1-audit-status-lane-tooltip-thread-jump`
