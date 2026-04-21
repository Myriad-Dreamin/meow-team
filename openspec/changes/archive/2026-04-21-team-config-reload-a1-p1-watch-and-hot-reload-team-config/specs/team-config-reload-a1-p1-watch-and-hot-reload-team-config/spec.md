## ADDED Requirements

### Requirement: Runtime team config resolves from the default or overridden file path
The system SHALL load the effective team configuration from
`process.cwd()/team.config.ts` by default and SHALL use
`REVIVAL_TEAM_CONFIG_PATH` as the effective config file path when that
environment variable is set. The loaded module SHALL be validated through
`defineTeamConfig` before server-side consumers use it.

#### Scenario: Default path is used when no override is configured
- **WHEN** a server-side read requests team config and
  `REVIVAL_TEAM_CONFIG_PATH` is unset
- **THEN** the system SHALL resolve the effective config file as
  `process.cwd()/team.config.ts`
- **AND** SHALL return the validated config exported from that file

#### Scenario: Override path replaces the default config location
- **WHEN** a server-side read requests team config and
  `REVIVAL_TEAM_CONFIG_PATH` is set
- **THEN** the system SHALL load team config from the override path instead of
  `process.cwd()/team.config.ts`
- **AND** SHALL expose the override-backed config to subsequent server-side
  consumers

### Requirement: Runtime team config reloads after file-state changes
The system SHALL cache the loaded team config together with the effective
config file snapshot and SHALL invalidate that cache when the target file
appears, disappears, or changes mtime so the next server-side read observes the
new file state without restarting the process.

#### Scenario: Modified config is observed on the next server-side read
- **WHEN** the effective config file mtime changes after a successful load
- **THEN** the next server-side config read SHALL reload the file instead of
  returning the prior cached value
- **AND** SHALL expose the updated team settings to later request handling

#### Scenario: Missing config file can appear later
- **WHEN** the effective config file is missing during one read and later
  appears at the same path
- **THEN** the first server-side read after the file appears SHALL attempt a
  fresh load from that path
- **AND** SHALL return the new validated config instead of keeping the missing
  state cached indefinitely

#### Scenario: Removed config file does not leave stale config active
- **WHEN** the effective config file existed for a prior successful read and is
  later removed
- **THEN** the next server-side read SHALL treat the file as missing
- **AND** SHALL NOT keep serving the last cached config snapshot as if the file
  still existed

### Requirement: Server-side consumers observe updated team settings on subsequent reads
The system SHALL route server-side reads for repository roots, storage paths,
notification targets, workflow metadata, dispatch branch settings,
`dispatch.maxProposalCount`, and `dispatch.workerCount` through the runtime
team-config accessor so updates apply to later page renders, API requests, and
orchestration decisions without restarting Next.js.

#### Scenario: Planner proposal limits refresh after a config edit
- **WHEN** `dispatch.maxProposalCount` changes in the effective config file
- **THEN** the next planner execution SHALL build its response schema and prompt
  context from the updated value
- **AND** SHALL stop using the boot-time limit captured before the edit

#### Scenario: Worker-count-driven execution capacity refreshes after a config edit
- **WHEN** `dispatch.workerCount` changes in the effective config file
- **THEN** the next queued executor creation and dispatch-capacity check SHALL
  use the updated worker count
- **AND** SHALL stop enforcing the previous boot-time concurrency value

#### Scenario: Request-time pages and routes pick up updated config-owned values
- **WHEN** repository roots, storage paths, notification targets, workflow
  metadata, or dispatch branch settings change in the effective config file
- **THEN** the next server-rendered page or API request that reads those values
  SHALL observe the updated config
- **AND** SHALL do so without requiring a server restart

### Requirement: Materialized artifacts preserve request title metadata
The materialized OpenSpec artifacts SHALL preserve the canonical request/PR
title `feat(team/config): enable team config hot reload` and conventional-title
metadata `feat(team/config)` without changing the approved change name.

#### Scenario: Proposal set mirrors approved metadata
- **WHEN** planner materializes this change
- **THEN** `proposal.md`, `design.md`, `tasks.md`, and this spec SHALL
  reference the canonical request/PR title
  `feat(team/config): enable team config hot reload`
- **AND** SHALL keep `feat(team/config)` as metadata rather than altering the
  change path `team-config-reload-a1-p1-watch-and-hot-reload-team-config`
