## ADDED Requirements

### Requirement: The workspace sidebar starts collapsed

The workspace SHALL hide the left sidebar on initial load so the editor pane becomes the default visible area across desktop and narrow workspace layouts.

#### Scenario: Initial workspace load keeps the editor in focus

- **WHEN** the workspace loads with any current living or archived thread state
- **THEN** the left sidebar SHALL not occupy layout space on first render
- **AND** the editor pane SHALL render as the primary visible content area
- **AND** an always-visible reveal control outside the sidebar SHALL remain available

#### Scenario: Narrow layouts do not stack a hidden sidebar above the editor

- **WHEN** the workspace loads on a viewport that uses the single-column workspace shell
- **THEN** the hidden sidebar SHALL not render as a stacked block ahead of the editor content

### Requirement: The sidebar reveal control stays available in persistent chrome

The workspace SHALL provide an always-visible control in persistent chrome that can open and close the left sidebar without changing the current run, settings, or thread content.

#### Scenario: The owner reopens the sidebar from the status bar

- **WHEN** the owner activates the reveal control while the sidebar is hidden
- **THEN** the workspace SHALL show the sidebar again
- **AND** the control SHALL expose accessible state and action text for the resulting sidebar state

#### Scenario: The owner hides the sidebar after opening it

- **WHEN** the owner activates the same reveal control while the sidebar is visible
- **THEN** the workspace SHALL collapse the sidebar again
- **AND** the currently selected run, settings, or thread view SHALL remain active in the editor

### Requirement: Sidebar collapse preserves navigation context

The workspace SHALL preserve thread navigation context when the sidebar is hidden and reopened, including selected threads, archived-thread reveal behavior, and repository-group collapse state.

#### Scenario: Reopening the sidebar keeps archived thread navigation available

- **WHEN** an archived thread is selected and the owner reopens the sidebar
- **THEN** the Archived Threads section SHALL remain revealed
- **AND** the selected archived thread SHALL still be reachable from the reopened navigation

#### Scenario: Reopening the sidebar preserves collapsed repository groups

- **WHEN** the owner collapses an inactive repository group, hides the sidebar, and reopens it
- **THEN** that repository group SHALL remain collapsed after the sidebar returns

#### Scenario: Selecting a thread from another surface does not force the sidebar open

- **WHEN** the owner selects a living thread from a status-lane popover while the sidebar is hidden
- **THEN** the editor SHALL switch to that thread
- **AND** the sidebar SHALL remain collapsed until the owner explicitly reopens it

### Requirement: Sidebar visibility behavior has focused regression coverage

The codebase SHALL add automated coverage for sidebar visibility defaults and toggle-state helpers under the existing Vitest setup.

#### Scenario: Visibility regressions fail the relevant Vitest suite

- **WHEN** sidebar visibility defaults or reveal logic regress
- **THEN** the relevant Vitest coverage SHALL fail before the change is treated as complete

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `feat(workspace/sidebar): collapse left sidebar by default` and conventional-title metadata `feat(workspace/sidebar)` through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(workspace/sidebar): collapse left sidebar by default`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `sidebar-default-a1-p1-hide-the-left-sidebar-by-default`
