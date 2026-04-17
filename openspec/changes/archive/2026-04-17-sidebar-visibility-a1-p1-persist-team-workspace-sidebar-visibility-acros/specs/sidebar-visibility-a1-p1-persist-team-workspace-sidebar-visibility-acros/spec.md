## ADDED Requirements

### Requirement: TeamWorkspace sidebar visibility persists in browser storage

The Next.js TeamWorkspace SHALL persist the sidebar open or closed state in
browser `localStorage` whenever the owner uses the existing sidebar toggle.

#### Scenario: Opening the sidebar survives a refresh

- **WHEN** the sidebar is collapsed, the owner opens it with the current
  status-bar toggle, and the page is refreshed in the same browser
- **THEN** the workspace SHALL restore the sidebar in the open state after the
  refresh

#### Scenario: Hiding the sidebar survives a refresh

- **WHEN** the sidebar is visible, the owner closes it with the current
  status-bar toggle, and the page is refreshed in the same browser
- **THEN** the workspace SHALL restore the sidebar in the collapsed state after
  the refresh

### Requirement: Stored sidebar visibility restores safely

The Next.js TeamWorkspace SHALL restore sidebar visibility only from valid
browser-local storage values and SHALL fall back to the existing collapsed
default when no valid stored preference exists.

#### Scenario: Missing sidebar preference keeps the collapsed default

- **WHEN** the workspace loads in a browser that has no stored sidebar
  visibility value
- **THEN** the sidebar SHALL remain collapsed by default

#### Scenario: Invalid sidebar preference keeps the collapsed default

- **WHEN** the workspace loads and the stored sidebar visibility value is
  missing, malformed, or otherwise invalid
- **THEN** the sidebar SHALL remain collapsed by default
- **AND** the existing sidebar toggle SHALL still let the owner open or close
  the sidebar normally

### Requirement: Sidebar visibility persistence has focused regression coverage

The codebase SHALL add automated coverage for sidebar visibility storage
parsing, default fallback handling, and persistence behavior under the existing
Vitest setup.

#### Scenario: Storage regressions fail the relevant Vitest suite

- **WHEN** valid, missing, invalid, or persistence behavior for sidebar
  visibility regresses
- **THEN** the relevant Vitest coverage SHALL fail before the change is treated
  as complete

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: persist workspace sidebar visibility` and conventional-title metadata
`feat` through the materialized OpenSpec artifacts without changing the
proposal change path
`sidebar-visibility-a1-p1-persist-team-workspace-sidebar-visibility-acros`.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat: persist workspace sidebar visibility`
- **AND** the conventional-title metadata SHALL remain `feat`
