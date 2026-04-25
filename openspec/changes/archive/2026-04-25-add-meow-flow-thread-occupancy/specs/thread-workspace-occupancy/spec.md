## ADDED Requirements

### Requirement: `meow-flow run` allocates a thread id to an idle workspace

The CLI SHALL provide `meow-flow run [--id <id>] "request body"` for use from inside a git-managed folder and SHALL allocate the resolved thread id to an existing registered `.paseo-worktrees/paseo-N` workspace for the canonical repository root before launching a Paseo agent for that workspace.

#### Scenario: Explicit id allocates the first idle registered slot

- **WHEN** a user runs `meow-flow run --id fix-test-ci "echo \"hello world\""` inside a git repository whose config sets `dispatch.maxConcurrentWorkers` to `3`
- **AND** `.paseo-worktrees/paseo-1` already has a running occupation
- **AND** `.paseo-worktrees/paseo-2` is registered as a Git worktree and has no running occupation
- **THEN** the CLI persists a running occupation for thread id `fix-test-ci` and `.paseo-worktrees/paseo-2`
- **AND** the command output identifies `fix-test-ci` as the thread id
- **AND** the command output identifies `.paseo-worktrees/paseo-2` as the allocated workspace

#### Scenario: Missing id generates a random UUID

- **WHEN** a user runs `meow-flow run "echo \"hello world\""`
- **AND** `.paseo-worktrees/paseo-1` is registered as a Git worktree and has no running occupation
- **THEN** the CLI generates a random UUID thread id
- **AND** the CLI persists the generated thread id for `.paseo-worktrees/paseo-1`
- **AND** the command output identifies the generated thread id

#### Scenario: Missing worktree slots are not allocated

- **WHEN** a user runs `meow-flow run --id fix-test-ci "echo \"hello world\""`
- **AND** `.paseo-worktrees/paseo-1` already has a running occupation
- **AND** `.paseo-worktrees/paseo-2` is not registered as a Git worktree
- **AND** `.paseo-worktrees/paseo-3` is registered as a Git worktree and has no running occupation
- **THEN** the CLI allocates `.paseo-worktrees/paseo-3`
- **AND** the CLI does not create `.paseo-worktrees/paseo-2`

#### Scenario: No idle registered workspace is available

- **WHEN** a user runs `meow-flow run --id fix-test-ci "echo \"hello world\""`
- **AND** every configured registered `.paseo-worktrees/paseo-N` workspace is occupied or not-created
- **THEN** the command exits with an error explaining that no idle thread workspace is available
- **AND** the command does not mutate existing occupations

### Requirement: `meow-flow run` launches a labeled Paseo agent with the request body

After allocating a workspace, `meow-flow run [--id <id>] "request body"` SHALL invoke `paseo run` with the allocated workspace as cwd, a label `x-meow-flow-id=<resolved-id>`, and the request body passed through unchanged.

#### Scenario: Fresh allocation launches Paseo run

- **WHEN** a user runs `meow-flow run --id fix-test-ci "echo \"hello world\""`
- **AND** `.paseo-worktrees/paseo-2` is selected as the idle registered workspace
- **THEN** the CLI invokes `paseo run` with cwd set to the absolute `.paseo-worktrees/paseo-2` path
- **AND** the `paseo run` invocation includes `--label x-meow-flow-id=fix-test-ci`
- **AND** the `paseo run` invocation uses `echo "hello world"` as the initial request

#### Scenario: Generated id is used as the Paseo label

- **WHEN** a user runs `meow-flow run "echo \"hello world\""`
- **AND** the generated thread id is `11111111-1111-4111-8111-111111111111`
- **THEN** the `paseo run` invocation includes `--label x-meow-flow-id=11111111-1111-4111-8111-111111111111`

#### Scenario: Failed Paseo run releases a fresh allocation

- **WHEN** `meow-flow run --id fix-test-ci "echo \"hello world\""` reserves `.paseo-worktrees/paseo-2`
- **AND** the subsequent `paseo run` invocation fails before creating a usable agent
- **THEN** the command exits with an error that includes the `paseo run` failure
- **AND** the CLI removes the fresh `fix-test-ci` occupation from the shared database

### Requirement: Running workspaces block duplicate thread launches

The CLI SHALL fail rather than launch a new agent in a workspace that already has a running Meow Flow thread occupation.

#### Scenario: Selected workspace becomes occupied before launch

- **WHEN** `meow-flow run --id add-feature "echo \"hello world\""` selects `.paseo-worktrees/paseo-2` as the candidate workspace
- **AND** another command records a running occupation for `.paseo-worktrees/paseo-2` before the allocation insert completes
- **THEN** the command exits with an error explaining that a thread is already running in that workspace
- **AND** the command does not invoke `paseo run`

#### Scenario: Only registered workspace is already running a thread

- **WHEN** a user runs `meow-flow run --id add-feature "echo \"hello world\""`
- **AND** `.paseo-worktrees/paseo-1` is the only configured registered workspace
- **AND** `.paseo-worktrees/paseo-1` already has a running occupation for thread id `fix-test-ci`
- **THEN** the command exits with an error explaining that no idle thread workspace is available
- **AND** the command does not invoke `paseo run`

### Requirement: Thread occupations are persisted in shared SQLite storage

The CLI SHALL store running thread occupation state in `~/.local/shared/meow-flow/meow-flow.sqlite` using the `better-sqlite3` package.

#### Scenario: First allocation creates the shared database

- **WHEN** a user runs `meow-flow run --id fix-test-ci "echo \"hello world\""`
- **AND** `~/.local/shared/meow-flow/meow-flow.sqlite` does not exist
- **THEN** the CLI creates the parent directory if needed
- **AND** the CLI creates the SQLite database and thread occupation schema
- **AND** the running occupation is persisted in that database

#### Scenario: Later list command reads the persisted allocation

- **WHEN** `meow-flow run --id fix-test-ci "echo \"hello world\""` has allocated `.paseo-worktrees/paseo-2`
- **AND** a later CLI process runs `meow-flow thread ls` in the same repository
- **THEN** the later process reads the allocation from `~/.local/shared/meow-flow/meow-flow.sqlite`
- **AND** the output reports `.paseo-worktrees/paseo-2 fix-test-ci`

### Requirement: Thread and workspace occupations are one-to-one

The occupation store SHALL prevent a thread id from running in more than one workspace and SHALL prevent a workspace from running more than one thread.

#### Scenario: Existing thread id fails clearly

- **WHEN** thread id `fix-test-ci` already occupies `.paseo-worktrees/paseo-2` in the current repository
- **AND** a user runs `meow-flow run --id fix-test-ci "echo \"hello world\""` from the same repository
- **THEN** the command exits with an error identifying the existing `.paseo-worktrees/paseo-2` allocation
- **AND** the CLI does not allocate any other workspace for `fix-test-ci`
- **AND** the CLI does not invoke `paseo run`

#### Scenario: Occupied workspace is skipped for a different thread id

- **WHEN** `.paseo-worktrees/paseo-1` is occupied by thread id `fix-test-ci`
- **AND** `.paseo-worktrees/paseo-2` is registered as a Git worktree and idle
- **AND** a user runs `meow-flow run --id add-feature "echo \"hello world\""`
- **THEN** the CLI allocates `.paseo-worktrees/paseo-2`
- **AND** the existing `fix-test-ci` occupation remains unchanged

#### Scenario: Thread id already allocated in another repository fails clearly

- **WHEN** thread id `fix-test-ci` already occupies a workspace for repository `/repo-a`
- **AND** a user runs `meow-flow run --id fix-test-ci "echo \"hello world\""` from repository `/repo-b`
- **THEN** the command exits with an error identifying the existing `/repo-a` allocation
- **AND** the command does not allocate a workspace in `/repo-b`

### Requirement: `meow-flow delete` releases running occupations by id

The CLI SHALL provide `meow-flow delete <id1> <id2> ...` to remove persisted running occupations for one or more thread ids from the shared SQLite database.

#### Scenario: Delete releases a single occupation

- **WHEN** thread id `fix-test-ci` occupies `.paseo-worktrees/paseo-2`
- **AND** a user runs `meow-flow delete fix-test-ci`
- **THEN** the CLI removes the `fix-test-ci` occupation from `~/.local/shared/meow-flow/meow-flow.sqlite`
- **AND** the command output identifies `fix-test-ci` and `.paseo-worktrees/paseo-2` as released

#### Scenario: Released workspace appears idle when listed

- **WHEN** thread id `fix-test-ci` occupied registered Git worktree `.paseo-worktrees/paseo-2`
- **AND** a user runs `meow-flow delete fix-test-ci`
- **AND** a later CLI process runs `meow-flow thread ls` in the same repository
- **THEN** the output reports `.paseo-worktrees/paseo-2 idle`

#### Scenario: Delete releases multiple occupations atomically

- **WHEN** thread id `fix-test-ci` occupies `.paseo-worktrees/paseo-1`
- **AND** thread id `add-feature` occupies `.paseo-worktrees/paseo-2`
- **AND** a user runs `meow-flow delete fix-test-ci add-feature`
- **THEN** the CLI removes both running occupations in one transaction
- **AND** the command output identifies both released thread ids

#### Scenario: Missing id prevents batch deletion

- **WHEN** thread id `fix-test-ci` occupies `.paseo-worktrees/paseo-1`
- **AND** no occupation exists for thread id `missing-thread`
- **AND** a user runs `meow-flow delete fix-test-ci missing-thread`
- **THEN** the command exits with an error identifying `missing-thread` as not found
- **AND** the `fix-test-ci` occupation remains in the shared database

#### Scenario: Delete does not remove the workspace folder

- **WHEN** thread id `fix-test-ci` occupies registered Git worktree `.paseo-worktrees/paseo-2`
- **AND** a user runs `meow-flow delete fix-test-ci`
- **THEN** `.paseo-worktrees/paseo-2` remains a registered Git worktree
- **AND** only the Meow Flow running occupation is removed
