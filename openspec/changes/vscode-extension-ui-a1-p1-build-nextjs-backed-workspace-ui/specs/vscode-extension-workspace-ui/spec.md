## ADDED Requirements

### Requirement: Host the meow-team workspace inside VS Code

The system SHALL provide a VS Code extension package in
`packages/vscode-extension` that opens the meow-team workspace inside VS Code
instead of requiring the owner to work exclusively in the browser.

#### Scenario: Owner opens the workspace from the editor

- **WHEN** the owner runs a meow-team command or view contributed by the
  extension
- **THEN** the extension SHALL open the meow-team workspace UI inside VS Code
- **AND** the workspace SHALL show which backend endpoint it is connected to

### Requirement: Use editor-native entry points for the workspace UI

The system SHALL contribute commands, configuration, and at least one primary
editor-native entry point for the meow-team workspace so common actions do not
depend on manual URL entry.

#### Scenario: Extension activation registers the meow-team surface

- **WHEN** the extension activates
- **THEN** VS Code SHALL register the meow-team commands and settings needed to
  open or reconnect the workspace

### Requirement: Keep the extension UI thin

The extension-hosted workspace UI SHALL delegate orchestration, persistence,
and workflow mutations to backend APIs instead of implementing those behaviors
inside the extension process.

#### Scenario: Owner triggers a team action from the workspace

- **WHEN** the owner starts, refreshes, or approves work from the workspace UI
- **THEN** the extension SHALL route the action through the configured backend
  contract instead of running the workflow locally
