## ADDED Requirements

### Requirement: Thread page hotkeys navigate existing thread surfaces

The selected thread detail view SHALL support thread-page-only keyboard
navigation so `Alt+N` reveals and focuses the existing `Living Threads`
navigation target and `Alt+1` through `Alt+9` jump to the matching ordered
thread timeline anchors derived from the visible anchor list.

#### Scenario: `Alt+N` focuses Living Threads from a selected thread

- **WHEN** the workspace is showing a selected thread tab and the user presses
  `Alt+N`
- **THEN** the system SHALL reveal the sidebar if it is hidden
- **AND** SHALL move focus to the existing `Living Threads` navigation target
  for the current workspace selection

#### Scenario: `Alt+1` through `Alt+9` jump to ordered thread anchors

- **WHEN** the workspace is showing a selected thread tab and the user presses
  `Alt+1`, `Alt+2`, or another supported digit with a matching ordered anchor
- **THEN** the system SHALL scroll the selected thread timeline to the matching
  ordered anchor from `buildTimelineAnchors()`
- **AND** SHALL keep the active rail highlight synchronized with the resolved
  anchor

#### Scenario: Unsupported digits do not steal browser behavior

- **WHEN** the workspace is showing a selected thread tab and the user presses
  an unsupported or unmatched `Alt+<digit>` combination
- **THEN** the system SHALL leave the current focus and scroll position
  unchanged
- **AND** SHALL NOT intercept the browser default for that key combination

### Requirement: Thread page hotkeys ignore editable surfaces

The system SHALL ignore supported thread-page hotkeys while focus is inside an
editable control, including `input`, `textarea`, `select`, or
content-editable surfaces.

#### Scenario: Feedback entry keeps normal typing behavior

- **WHEN** focus is inside a feedback field or other editable surface on the
  thread page and the user presses `Alt+N` or `Alt+1`
- **THEN** the system SHALL NOT trigger sidebar focus, timeline scrolling, or
  hotkey-specific `preventDefault()` behavior

### Requirement: Hotkeys stay scoped to the selected thread view

The system SHALL only listen for these shortcuts while the selected workspace
tab is a thread detail view.

#### Scenario: Run and settings tabs remain unchanged

- **WHEN** the workspace is showing the run tab or settings tab and the user
  presses `Alt+N` or `Alt+1`
- **THEN** the system SHALL leave existing tab behavior unchanged

### Requirement: Thread hotkey resolution stays regression covered

The system SHALL keep shortcut matching and digit-to-anchor resolution covered
by targeted regression tests near the existing timeline helper tests.

#### Scenario: Shortcut resolution remains testable without browser-only setup

- **WHEN** the thread hotkey behavior is implemented
- **THEN** the system SHALL include automated coverage for supported shortcut
  matching, editable-target suppression, and ordered anchor resolution

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a
  reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: enable thread page hotkeys` and conventional-title metadata `feat`
through the materialized OpenSpec artifacts without changing the approved
change path `thread-hotkeys-a1-p1-add-thread-page-hotkeys`.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat: enable thread page hotkeys`
- **AND** the slash-delimited roadmap or topic scope SHALL remain metadata
  instead of changing the OpenSpec change path
