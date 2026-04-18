## ADDED Requirements

### Requirement: Thread detail tabs expose workspace navigation shortcuts

The workspace SHALL expose `Alt+N` and `Alt+1` through `Alt+9` only while a
thread detail tab is active.

#### Scenario: Alt+N returns from a thread detail tab to the living-thread surface

- **WHEN** the owner presses `Alt+N` while any thread detail tab is selected
- **THEN** the workspace SHALL switch to the existing Run Team and living-thread surface
- **AND** the current sidebar, archived-thread reveal, and thread polling state SHALL remain intact

#### Scenario: Numeric shortcuts are ignored outside thread detail tabs

- **WHEN** the owner presses `Alt+1` through `Alt+9` while the Run Team or Settings tab is selected
- **THEN** the workspace SHALL leave the current tab unchanged
- **AND** the shortcut SHALL not open a thread detail tab from those non-thread surfaces

### Requirement: Numeric shortcuts follow deterministic active living-thread ordering

The workspace SHALL map `Alt+1` through `Alt+9` to active living threads using
the same repository-group and thread ordering rendered in the Living Threads
sidebar, excluding archived and terminal threads.

#### Scenario: Sidebar order defines the numeric mapping

- **WHEN** living threads are grouped and sorted for the sidebar
- **THEN** the numeric shortcuts SHALL flatten that rendered order when assigning indices
- **AND** `Alt+1` SHALL target the first active living thread in that ordered list

#### Scenario: Archived and terminal threads do not consume shortcut positions

- **WHEN** archived threads or terminal-status living threads exist beside active living threads
- **THEN** the numeric shortcuts SHALL skip those threads when computing indices
- **AND** only non-terminal living threads SHALL be reachable through `Alt+1` through `Alt+9`

#### Scenario: Missing numeric targets no-op

- **WHEN** the owner presses `Alt+9` and fewer than nine active living threads are available
- **THEN** the workspace SHALL leave the current tab unchanged
- **AND** the shortcut SHALL not open archived threads, settings, or any synthetic placeholder tab

### Requirement: Shortcut handling respects editable focus and tab persistence

The workspace SHALL ignore these shortcuts while the owner is typing into
editable UI and SHALL persist successful shortcut-driven tab changes through
the existing selected-tab storage flow.

#### Scenario: Editable focus blocks workspace shortcut navigation

- **WHEN** focus is inside an input, textarea, or contenteditable element
- **THEN** `Alt+N` and `Alt+1` through `Alt+9` SHALL not change the selected workspace tab
- **AND** the focused control SHALL retain its native keyboard behavior

#### Scenario: Shortcut-driven tab switches persist like click navigation

- **WHEN** a recognized shortcut switches the owner to the Run Team tab or another thread detail tab
- **THEN** the workspace SHALL persist the new selected tab through the existing tab-selection storage flow
- **AND** refreshing the page SHALL restore that selected tab when the same target still exists in the workspace summary list

### Requirement: Shortcut behavior has targeted regression coverage

The codebase SHALL add targeted Vitest coverage for shortcut parsing,
deterministic active-thread ordering, missing-index no-ops, and editable-focus
guards.

#### Scenario: Relevant shortcut regressions fail the Vitest suite

- **WHEN** shortcut parsing, ordering, or guard behavior regresses
- **THEN** the relevant Vitest coverage SHALL fail before the change is treated as complete

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: enable thread page shortcuts` and conventional-title metadata `feat`
through the materialized OpenSpec artifacts without encoding
slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change
paths.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat: enable thread page shortcuts`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `thread-shortcuts-a1-p1-add-thread-page-navigation-shortcuts`
