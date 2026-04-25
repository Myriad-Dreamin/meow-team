## ADDED Requirements

### Requirement: `meow-flow run` allocates a thread to an idle workspace

The CLI SHALL provide `meow-flow run <thread>` for use from inside a git-managed folder and SHALL allocate the named thread to an existing registered `.paseo-worktrees/paseo-N` workspace for the canonical repository root before launching a Paseo agent for that workspace.

#### Scenario: First idle registered slot is allocated

- **WHEN** a user runs `meow-flow run fix-test-ci` inside a git repository whose config sets `dispatch.maxConcurrentWorkers` to `3`
- **AND** `.paseo-worktrees/paseo-1` is already occupied
- **AND** `.paseo-worktrees/paseo-2` is registered as a Git worktree and has no occupation
- **THEN** the CLI persists an occupation for thread `fix-test-ci` and `.paseo-worktrees/paseo-2`
- **AND** the command output identifies `.paseo-worktrees/paseo-2` as the allocated workspace

#### Scenario: Missing worktree slots are not allocated

- **WHEN** a user runs `meow-flow run fix-test-ci`
- **AND** `.paseo-worktrees/paseo-1` is occupied
- **AND** `.paseo-worktrees/paseo-2` is not registered as a Git worktree
- **AND** `.paseo-worktrees/paseo-3` is registered as a Git worktree and has no occupation
- **THEN** the CLI allocates `.paseo-worktrees/paseo-3`
- **AND** the CLI does not create `.paseo-worktrees/paseo-2`

#### Scenario: No idle registered workspace is available

- **WHEN** a user runs `meow-flow run fix-test-ci`
- **AND** every configured registered `.paseo-worktrees/paseo-N` workspace is occupied or not-created
- **THEN** the command exits with an error explaining that no idle thread workspace is available
- **AND** the command does not mutate existing occupations

### Requirement: `meow-flow run` launches a labeled Paseo agent

After allocating a workspace, `meow-flow run <thread>` SHALL invoke `paseo run` with the allocated workspace as cwd, a label `x-meow-flow-id=<thread>`, and an initial placeholder request to echo `"hello world"`.

#### Scenario: Fresh allocation launches Paseo run

- **WHEN** a user runs `meow-flow run fix-test-ci`
- **AND** `.paseo-worktrees/paseo-2` is selected as the idle registered workspace
- **THEN** the CLI invokes `paseo run` with cwd set to the absolute `.paseo-worktrees/paseo-2` path
- **AND** the `paseo run` invocation includes `--label x-meow-flow-id=fix-test-ci`
- **AND** the initial request asks the agent to echo `"hello world"`

#### Scenario: Failed Paseo run releases a fresh allocation

- **WHEN** `meow-flow run fix-test-ci` reserves `.paseo-worktrees/paseo-2`
- **AND** the subsequent `paseo run` invocation fails before creating a usable agent
- **THEN** the command exits with an error that includes the `paseo run` failure
- **AND** the CLI removes the fresh `fix-test-ci` occupation from the shared database

#### Scenario: Existing allocation is not launched twice

- **WHEN** thread `fix-test-ci` already occupies `.paseo-worktrees/paseo-2` in the current repository
- **AND** a user runs `meow-flow run fix-test-ci` again from the same repository
- **THEN** the CLI returns the existing `.paseo-worktrees/paseo-2` allocation
- **AND** the CLI does not invoke `paseo run` again for `fix-test-ci`

### Requirement: Thread occupations are persisted in shared SQLite storage

The CLI SHALL store thread occupation state in `~/.local/shared/meow-flow/meow-flow.sqlite` using the `better-sqlite3` package.

#### Scenario: First allocation creates the shared database

- **WHEN** a user runs `meow-flow run fix-test-ci`
- **AND** `~/.local/shared/meow-flow/meow-flow.sqlite` does not exist
- **THEN** the CLI creates the parent directory if needed
- **AND** the CLI creates the SQLite database and thread occupation schema
- **AND** the allocation is persisted in that database

#### Scenario: Later list command reads the persisted allocation

- **WHEN** `meow-flow run fix-test-ci` has allocated `.paseo-worktrees/paseo-2`
- **AND** a later CLI process runs `meow-flow thread ls` in the same repository
- **THEN** the later process reads the allocation from `~/.local/shared/meow-flow/meow-flow.sqlite`
- **AND** the output reports `.paseo-worktrees/paseo-2 fix-test-ci`

### Requirement: Thread and workspace occupations are one-to-one

The occupation store SHALL prevent a thread from occupying more than one workspace and SHALL prevent a workspace from being occupied by more than one thread.

#### Scenario: Running an already allocated thread is idempotent

- **WHEN** thread `fix-test-ci` already occupies `.paseo-worktrees/paseo-2` in the current repository
- **AND** a user runs `meow-flow run fix-test-ci` again from the same repository
- **THEN** the CLI returns the existing `.paseo-worktrees/paseo-2` allocation
- **AND** the CLI does not allocate any other workspace for `fix-test-ci`

#### Scenario: Occupied workspace is skipped for a different thread

- **WHEN** `.paseo-worktrees/paseo-1` is occupied by thread `fix-test-ci`
- **AND** `.paseo-worktrees/paseo-2` is registered as a Git worktree and idle
- **AND** a user runs `meow-flow run add-feature`
- **THEN** the CLI allocates `.paseo-worktrees/paseo-2`
- **AND** the existing `fix-test-ci` occupation remains unchanged

#### Scenario: Thread already allocated in another repository fails clearly

- **WHEN** thread `fix-test-ci` already occupies a workspace for repository `/repo-a`
- **AND** a user runs `meow-flow run fix-test-ci` from repository `/repo-b`
- **THEN** the command exits with an error identifying the existing `/repo-a` allocation
- **AND** the command does not allocate a workspace in `/repo-b`
