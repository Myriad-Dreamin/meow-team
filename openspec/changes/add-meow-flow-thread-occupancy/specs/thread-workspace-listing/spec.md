## ADDED Requirements

### Requirement: Top-level list command aliases thread list

The CLI SHALL provide `meow-flow ls` as an alias for `meow-flow thread ls`.

#### Scenario: Top-level alias lists the same workspace rows

- **WHEN** a user runs `meow-flow ls` from inside a git-managed folder
- **THEN** the CLI uses the same config resolution, canonical root detection, worktree detection, occupation detection, and output formatting as `meow-flow thread ls`

#### Scenario: Top-level alias accepts explicit config

- **WHEN** a user runs `meow-flow ls --config /repo/team.config.js`
- **THEN** the CLI uses `/repo/team.config.js` with the same behavior as `meow-flow thread ls --config /repo/team.config.js`

## MODIFIED Requirements

### Requirement: Thread list command reports current slot allocation status

The CLI SHALL report one line per configured slot with the relative `.paseo-worktrees/paseo-N` path and a workspace status. The workspace status domain SHALL include `idle`, `occupied`, and `not-created`. Occupied rows SHALL print the occupying thread name in the status position.

#### Scenario: Slot worktree exists and is idle

- **WHEN** `.paseo-worktrees/paseo-1` is registered as a Git worktree
- **AND** no persisted occupation exists for `.paseo-worktrees/paseo-1`
- **THEN** `meow-flow thread ls` prints `.paseo-worktrees/paseo-1 idle`

#### Scenario: Slot worktree is occupied

- **WHEN** `.paseo-worktrees/paseo-2` is registered as a Git worktree
- **AND** the shared occupation database records thread `fix-test-ci` for `.paseo-worktrees/paseo-2`
- **THEN** `meow-flow thread ls` prints `.paseo-worktrees/paseo-2 fix-test-ci`

#### Scenario: Slot worktree is not allocated

- **WHEN** `.paseo-worktrees/paseo-3` is not registered as a Git worktree
- **THEN** `meow-flow thread ls` prints `.paseo-worktrees/paseo-3 not-created (folder is not allocated)`

#### Scenario: Stale occupation for missing worktree is not-created

- **WHEN** `.paseo-worktrees/paseo-3` is not registered as a Git worktree
- **AND** the shared occupation database contains a stale occupation for `.paseo-worktrees/paseo-3`
- **THEN** `meow-flow thread ls` prints `.paseo-worktrees/paseo-3 not-created (folder is not allocated)`
- **AND** the command does not report the stale thread as occupying a usable workspace
