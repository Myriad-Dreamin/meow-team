# chat-strip-status-a1-p1-relocate-thread-status-into-the-chat-link-strip Specification

## Purpose
Define the consolidated thread-header status capability so the selected
thread's status pill and archived badge live in the chat link strip beside the
existing metadata chips, allowing the redundant workspace header metadata row
to be removed without changing thread-state logic.
## Requirements
### Requirement: Relocate thread status into the chat link strip
The system SHALL render the selected thread status indicator in the thread
detail chat link strip and remove the separate active-thread
`.workspace-editor-meta` row from the workspace editor header.

#### Scenario: Active thread detail shows consolidated metadata
- **WHEN** a user opens a selected thread in the workspace
- **THEN** the thread detail `.thread-chat-link-strip` SHALL include the
  current thread status pill beside the existing metadata chips
- **AND** the workspace editor header SHALL render without a separate
  `.workspace-editor-meta` row

#### Scenario: Archived thread state remains visible
- **WHEN** the selected thread has an `archivedAt` value
- **THEN** the chat link strip SHALL show the archived badge alongside the
  current status pill so archived visibility is preserved after the header-row
  removal

### Requirement: Chat-strip chips and status pills coexist
The system SHALL style the chat link strip so plain metadata chips, links, and
status pills can render together without conflicting backgrounds, typography,
or responsive wrapping behavior.

#### Scenario: Mixed chip types share the strip
- **WHEN** the thread chat link strip renders plain metadata chips, links, and
  `.status-pill` elements together
- **THEN** the plain chips and links SHALL keep the strip-chip appearance
- **AND** each status pill SHALL keep the existing status-specific treatment

#### Scenario: Narrow layouts keep the consolidated strip readable
- **WHEN** the workspace is rendered at the current mobile breakpoint
- **THEN** the consolidated chat link strip SHALL wrap mixed chip types
  without relying on a `.workspace-editor-meta`-specific override

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
`feat(thread/header): relocate thread status strip` and conventional-title
metadata `feat(thread/header)` through the materialized OpenSpec artifacts
without encoding slash-delimited roadmap/topic scope into `branchPrefix` or
OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `feat(thread/header): relocate thread status strip`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `chat-strip-status-a1-p1-relocate-thread-status-into-the-chat-link-strip`
