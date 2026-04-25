# thread-workspace-listing Specification

## Purpose
Define how Meow Flow lists configured Paseo thread worktree slots for the current repository, including root resolution, configured slot counts, and displayed allocation status.

## Requirements
### Requirement: Thread list command resolves the current repository root

The CLI SHALL provide `mfl thread ls` for use from inside a git-managed folder and SHALL resolve the canonical repository root that owns the `.paseo-worktrees` directory.

#### Scenario: Command runs inside the primary checkout

- **WHEN** a user runs `mfl thread ls` from a directory inside a primary git checkout
- **THEN** the command resolves the primary checkout root as the repository root

#### Scenario: Command runs inside a linked Paseo worktree

- **WHEN** a user runs `mfl thread ls` from inside `.paseo-worktrees/paseo-1`
- **THEN** the command resolves the primary checkout root that owns `.paseo-worktrees`

#### Scenario: Command runs outside git

- **WHEN** a user runs `mfl thread ls` outside a git-managed folder
- **THEN** the command fails with a diagnostic explaining that it must be run inside a git repository

### Requirement: Thread list command uses configured slot count

The CLI SHALL load Meow Flow config using the same explicit-or-shared config resolution as `mfl plan` and SHALL use `dispatch.maxConcurrentWorkers` as the maximum slot number for `mfl thread ls`.

#### Scenario: Configured max controls listed slots

- **WHEN** the resolved config has `dispatch.maxConcurrentWorkers` set to `3`
- **THEN** `mfl thread ls` evaluates exactly `paseo-1`, `paseo-2`, and `paseo-3`

#### Scenario: Missing configured max

- **WHEN** the resolved config does not set `dispatch.maxConcurrentWorkers`
- **THEN** `mfl thread ls` fails with a diagnostic explaining that the thread slot count must be configured

### Requirement: Thread list command reports current slot allocation status

The CLI SHALL report one line per configured slot with the relative `.paseo-worktrees/paseo-N` path and a workspace status. The workspace status domain SHALL include `idle`, `occupied`, and `not-created`. Occupied rows SHALL print the occupying thread id in the status position.

#### Scenario: Slot worktree exists and is idle

- **WHEN** `.paseo-worktrees/paseo-1` is registered as a Git worktree
- **AND** no persisted occupation exists for `.paseo-worktrees/paseo-1`
- **THEN** `mfl thread ls` prints `.paseo-worktrees/paseo-1 idle`

#### Scenario: Slot worktree is occupied

- **WHEN** `.paseo-worktrees/paseo-2` is registered as a Git worktree
- **AND** the shared occupation database records thread id `fix-test-ci` for `.paseo-worktrees/paseo-2`
- **THEN** `mfl thread ls` prints `.paseo-worktrees/paseo-2 fix-test-ci`

#### Scenario: Slot worktree is not allocated

- **WHEN** `.paseo-worktrees/paseo-3` is not registered as a Git worktree
- **THEN** `mfl thread ls` prints `.paseo-worktrees/paseo-3 not-created (folder is not allocated)`

#### Scenario: Stale occupation for missing worktree is not-created

- **WHEN** `.paseo-worktrees/paseo-3` is not registered as a Git worktree
- **AND** the shared occupation database contains a stale occupation for `.paseo-worktrees/paseo-3`
- **THEN** `mfl thread ls` prints `.paseo-worktrees/paseo-3 not-created (folder is not allocated)`
- **AND** the command does not report the stale thread id as occupying a usable workspace

### Requirement: Top-level list command aliases thread list

The CLI SHALL provide `mfl ls` as an alias for `mfl thread ls`.

#### Scenario: Top-level alias lists the same workspace rows

- **WHEN** a user runs `mfl ls` from inside a git-managed folder
- **THEN** the CLI uses the same config resolution, canonical root detection, worktree detection, occupation detection, and output formatting as `mfl thread ls`

#### Scenario: Top-level alias accepts explicit config

- **WHEN** a user runs `mfl ls --config /repo/team.config.js`
- **THEN** the CLI uses `/repo/team.config.js` with the same behavior as `mfl thread ls --config /repo/team.config.js`
