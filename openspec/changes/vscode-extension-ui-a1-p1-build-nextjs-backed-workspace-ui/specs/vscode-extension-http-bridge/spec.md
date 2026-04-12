## ADDED Requirements

### Requirement: Use an explicit HTTP bridge to the Next.js backend

The system SHALL connect the VS Code extension to the existing Next.js backend
through explicit GET/POST requests against a resolved base URL instead of
through in-process runtime imports.

#### Scenario: Workspace UI reads backend state

- **WHEN** the extension UI needs thread, run, or configuration data
- **THEN** the extension SHALL issue a GET request to the configured backend
  base URL
- **AND** the response SHALL be translated into editor-facing UI state

#### Scenario: Workspace UI mutates backend state

- **WHEN** the owner submits, retries, or approves an action from the extension
- **THEN** the extension SHALL issue a POST request to the configured backend
  endpoint for that action

### Requirement: Make backend connectivity configurable and observable

The system SHALL let the owner configure the backend base URL used by the
extension and SHALL surface connection failures with actionable recovery
guidance.

#### Scenario: Backend becomes unreachable

- **WHEN** the extension cannot reach the configured backend
- **THEN** the workspace UI SHALL show that the backend connection failed
- **AND** the UI SHALL provide recovery guidance instead of failing silently

#### Scenario: Owner updates the backend URL

- **WHEN** the owner changes the backend base URL in extension settings or
  connection UI
- **THEN** subsequent GET/POST requests SHALL use the updated endpoint
