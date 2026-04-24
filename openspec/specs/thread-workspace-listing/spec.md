## Requirements

### Requirement: Thread list command resolves the current repository root

The CLI SHALL provide `meow-flow thread ls` for use from inside a git-managed folder and SHALL resolve the canonical repository root that owns the `.paseo-worktrees` directory.

#### Scenario: Command runs inside the primary checkout

- **WHEN** a user runs `meow-flow thread ls` from a directory inside a primary git checkout
- **THEN** the command resolves the primary checkout root as the repository root

#### Scenario: Command runs inside a linked Paseo worktree

- **WHEN** a user runs `meow-flow thread ls` from inside `.paseo-worktrees/paseo-1`
- **THEN** the command resolves the primary checkout root that owns `.paseo-worktrees`

#### Scenario: Command runs outside git

- **WHEN** a user runs `meow-flow thread ls` outside a git-managed folder
- **THEN** the command fails with a diagnostic explaining that it must be run inside a git repository

### Requirement: Thread list command uses configured slot count

The CLI SHALL load Meow Flow config using the same explicit-or-shared config resolution as `meow-flow plan` and SHALL use `dispatch.maxConcurrentWorkers` as the maximum slot number for `meow-flow thread ls`.

#### Scenario: Configured max controls listed slots

- **WHEN** the resolved config has `dispatch.maxConcurrentWorkers` set to `3`
- **THEN** `meow-flow thread ls` evaluates exactly `paseo-1`, `paseo-2`, and `paseo-3`

#### Scenario: Missing configured max

- **WHEN** the resolved config does not set `dispatch.maxConcurrentWorkers`
- **THEN** `meow-flow thread ls` fails with a diagnostic explaining that the thread slot count must be configured

### Requirement: Thread list command reports current slot allocation status

The CLI SHALL report one line per configured slot with the relative `.paseo-worktrees/paseo-N` path and a workspace status. The workspace status domain SHALL include `idle`, `occupied`, and `not-created`, but this change SHALL only emit `idle` or `not-created`.

#### Scenario: Slot worktree exists

- **WHEN** `.paseo-worktrees/paseo-1` is registered as a Git worktree
- **THEN** `meow-flow thread ls` prints `.paseo-worktrees/paseo-1 idle`

#### Scenario: Slot worktree is not allocated

- **WHEN** `.paseo-worktrees/paseo-3` is not registered as a Git worktree
- **THEN** `meow-flow thread ls` prints `.paseo-worktrees/paseo-3 not-created (folder is not allocated)`

#### Scenario: Occupation detection is deferred

- **WHEN** `.paseo-worktrees/paseo-2` is registered as a Git worktree
- **THEN** this change reports the slot as `idle`
- **AND** this change does not inspect thread, branch, process, or agent metadata to emit `occupied`
