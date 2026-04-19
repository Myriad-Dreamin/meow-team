## ADDED Requirements

### Requirement: Codex launches refresh runtime config after config file changes

The system SHALL obtain Codex runtime configuration through a cached accessor that refreshes its snapshot before a new Codex agent launch when `~/.codex/config.toml` has changed since the previous successful load.

#### Scenario: Changed config mtime reloads the snapshot

- **WHEN** a planner, coder, reviewer, or OpenSpec materializer launch begins after `~/.codex/config.toml` receives a newer mtime
- **THEN** the system SHALL re-read the Codex runtime config before validating launch prerequisites or building Codex CLI arguments
- **AND** the new launch SHALL use the updated model, provider, and base URL values from the refreshed snapshot

### Requirement: Unchanged config keeps the cached snapshot

The system SHALL reuse the cached Codex runtime config snapshot when the tracked config file mtime is unchanged so repeated launches do not re-parse the same file.

#### Scenario: Unchanged mtime skips reload

- **WHEN** a new Codex agent launch starts and `~/.codex/config.toml` has the same mtime as the cached snapshot
- **THEN** the system SHALL keep the existing parsed runtime config snapshot
- **AND** the launch SHALL preserve the same env and auth fallback behavior as before

### Requirement: Missing config transitions stay recoverable

The system SHALL handle missing `~/.codex/config.toml` as a valid cached state and refresh successfully when the file later appears or changes.

#### Scenario: Config file is created after startup

- **WHEN** the harness cached a missing-config state and a later launch sees that `~/.codex/config.toml` now exists with a readable mtime
- **THEN** the system SHALL refresh the runtime config snapshot before the launch continues
- **AND** the launch SHALL use the newly available file values without requiring a harness restart

### Requirement: Proposal metadata stays explicit in artifacts

The system SHALL carry the canonical request/PR title `feat: refresh codex config on changes` and conventional-title metadata `feat` through the materialized OpenSpec artifacts.

#### Scenario: Planner materializes the change

- **WHEN** the planner creates proposal, design, tasks, and spec artifacts for `reload-codex-config-a1-p1-add-mtime-aware-codex-runtime-config-reload`
- **THEN** those artifacts SHALL reference the canonical request/PR title `feat: refresh codex config on changes`
- **AND** the conventional-title metadata SHALL remain `feat` without altering the OpenSpec change path
