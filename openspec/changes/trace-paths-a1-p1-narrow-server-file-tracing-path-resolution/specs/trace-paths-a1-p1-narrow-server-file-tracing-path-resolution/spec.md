## ADDED Requirements

### Requirement: Config-owned filesystem paths are normalized before traced server helpers use them
The system SHALL resolve `storage.threadFile` and configured repository root
directories at the configuration boundary so traced server helpers receive
stable resolved paths instead of joining dynamic config strings onto the
project root at runtime.

#### Scenario: Relative config paths resolve once
- **WHEN** `defineTeamConfig` receives relative values for `storage.threadFile`
  or `repositories.roots[].directory`
- **THEN** the stored team configuration SHALL preserve the same effective
  locations as today
- **AND** SHALL expose those config-owned paths as resolved values for
  downstream server modules

#### Scenario: Absolute paths remain unchanged
- **WHEN** the team configuration uses an absolute `storage.threadFile` or an
  absolute repository root directory
- **THEN** the stored team configuration SHALL keep that absolute path without
  rebasing it

### Requirement: Storage and log path helpers derive bounded sibling paths from the normalized thread store
The system SHALL derive SQLite, legacy JSON, and `codex-logs` paths from the
already-resolved thread storage path and SHALL NOT perform a broad
`process.cwd()` join inside traced server storage and log helpers.

#### Scenario: SQLite paths keep current sibling behavior
- **WHEN** a normalized thread store path is provided to
  `resolveSqliteStorageLocation`
- **THEN** the helper SHALL preserve the existing `.sqlite` and `.json`
  sibling path rules for that resolved location
- **AND** SHALL continue to preserve `:memory:` as an in-memory storage target

#### Scenario: Codex logs stay beside the resolved thread store
- **WHEN** the team log helpers receive a normalized thread store path
- **THEN** they SHALL place log files under a `codex-logs` directory beside
  the resolved thread store directory
- **AND** SHALL NOT re-anchor the thread store path against `process.cwd()`

### Requirement: Repository discovery consumes normalized roots without dynamic project-root rebasing
The system SHALL list configured repositories from normalized repository root
directories and SHALL keep the existing root containment and accessibility
checks without resolving an arbitrary root string against `process.cwd()` at
listing time.

#### Scenario: Relative root configs still find repositories
- **WHEN** a repository root is configured with a relative directory
- **THEN** repository discovery SHALL scan the resolved absolute root produced
  by config parsing
- **AND** SHALL preserve the existing repository IDs, root labels, and
  relative-path ordering for discovered repositories

#### Scenario: Missing roots stay non-fatal
- **WHEN** a configured repository root does not exist or is not accessible
- **THEN** repository discovery SHALL return no repositories from that root
- **AND** SHALL continue scanning any other configured roots

### Requirement: OpenSpec archive handling uses bounded path segments and preserves idempotent retries
The system SHALL assemble active and archived OpenSpec change paths from
explicit `openspec/changes` segments and dated archive names so archive
inspection, moves, and retries stay bounded while preserving current
idempotent behavior.

#### Scenario: Active change archives into the dated archive directory
- **WHEN** an active change is archived for the first time
- **THEN** the system SHALL move it from `openspec/changes/<change-name>` to
  `openspec/changes/archive/<YYYY-MM-DD-change-name>`
- **AND** SHALL report that dated archive path as the archived location

#### Scenario: Existing archives are reused on retry
- **WHEN** archive finalization is retried after an earlier archive already
  exists for the same change
- **THEN** the system SHALL reuse the existing archived change path
- **AND** SHALL NOT create a second archive directory for the same change

### Requirement: Materialized artifacts preserve request title metadata
The materialized OpenSpec artifacts SHALL preserve the canonical request/PR
title `fix: narrow server file tracing paths` and conventional-title metadata
`fix` without changing the approved change name.

#### Scenario: Proposal set mirrors approved metadata
- **WHEN** planner materializes this change
- **THEN** `proposal.md`, `design.md`, `tasks.md`, and this spec SHALL
  reference the canonical request/PR title `fix: narrow server file tracing paths`
- **AND** SHALL keep `fix` as metadata rather than altering the change path
  `trace-paths-a1-p1-narrow-server-file-tracing-path-resolution`
