# thread-workspace-occupancy Specification

## Purpose
Define how Meow Flow allocates, persists, lists, and releases running thread occupations across registered Paseo worktree slots.

## Requirements
### Requirement: `mfl run` allocates a thread id to an idle worktree

The CLI SHALL provide `mfl run [--id <id>] [--stage <stage>] "request body"`
for use from inside a git-managed folder. For a new thread with no agents, the
CLI SHALL allocate the resolved thread id to an existing registered linked
MeowFlow worktree for the canonical repository root, store the request body,
derive the default stage as `plan`, and launch a plan agent. The stage value
SHALL be one of `plan`, `code`, `review`, `execute`, or `validate`.

#### Scenario: Explicit id allocates the first idle registered slot

- **WHEN** a user runs `mfl run --id fix-test-ci "echo \"hello world\""`
  inside a git repository with three configured linked worktrees
- **AND** the first worktree already has a running occupation
- **AND** the second worktree is registered as a Git worktree and has no
  running occupation
- **THEN** the CLI persists a running occupation for thread id `fix-test-ci`
  and the second worktree
- **AND** the command stores `echo "hello world"` as the thread request body
- **AND** the command launches the initial `plan` stage agent

#### Scenario: Missing id generates a random UUID

- **WHEN** a user runs `mfl run "echo \"hello world\""`
- **AND** a registered linked worktree has no running occupation
- **THEN** the CLI generates a random UUID thread id
- **AND** the CLI persists the generated thread id for that worktree
- **AND** the command output identifies the generated thread id

#### Scenario: Explicit stage plan is accepted for a new thread

- **WHEN** a user runs
  `mfl run --id fix-test-ci --stage plan "add auth"`
- **AND** a registered linked worktree has no running occupation
- **THEN** the CLI persists a running occupation for thread id `fix-test-ci`
- **AND** the command stores `add auth` as the thread request body
- **AND** the command launches a `meow-plan` agent

#### Scenario: Unsupported stage is rejected

- **WHEN** a user runs
  `mfl run --id fix-test-ci --stage deploy "add auth"`
- **THEN** the command exits with an error explaining that the stage must be
  one of `plan`, `code`, `review`, `execute`, or `validate`
- **AND** the command does not mutate existing occupations
- **AND** the command does not invoke `paseo run`

#### Scenario: Missing worktree slots are not allocated

- **WHEN** a user runs `mfl run --id fix-test-ci "echo \"hello world\""`
- **AND** the first linked worktree already has a running occupation
- **AND** the second linked worktree is not registered as a Git worktree
- **AND** the third linked worktree is registered as a Git worktree and has no
  running occupation
- **THEN** the CLI allocates the third linked worktree
- **AND** the CLI does not create the second linked worktree

#### Scenario: No idle registered worktree is available

- **WHEN** a user runs `mfl run --id fix-test-ci "echo \"hello world\""`
- **AND** every configured registered linked worktree is occupied or
  not-created
- **THEN** the command exits with an error explaining that no idle thread
  worktree is available
- **AND** the command does not mutate existing occupations

### Requirement: `mfl run` launches a labeled Paseo agent with the request body

The CLI SHALL invoke `paseo run` with a labeled stage prompt after resolving
the thread and stage. The invocation uses the target worktree as cwd, includes
`--label x-meow-flow-id=<resolved-id>`, and includes the request body unchanged
inside the MeowFlow stage prompt. The command SHALL parse the created Paseo
agent id, persist the agent metadata when available, and print `agent-id:
<id>` plus `next-seq: <seq>`.

#### Scenario: Fresh allocation launches Paseo run with a plan prompt

- **WHEN** a user runs `mfl run --id fix-test-ci "echo \"hello world\""`
- **AND** the second linked worktree is selected as the idle registered
  worktree
- **THEN** the CLI invokes `paseo run` with cwd set to the absolute worktree
  path
- **AND** the `paseo run` invocation includes
  `--label x-meow-flow-id=fix-test-ci`
- **AND** the `paseo run` invocation includes a `meow-plan` prompt
- **AND** the stage prompt includes `echo "hello world"` unchanged

#### Scenario: Generated id is used as the Paseo label

- **WHEN** a user runs `mfl run "echo \"hello world\""`
- **AND** the generated thread id is `11111111-1111-4111-8111-111111111111`
- **THEN** the `paseo run` invocation includes `--label x-meow-flow-id=11111111-1111-4111-8111-111111111111`

#### Scenario: Run output includes agent id and next handoff sequence

- **WHEN** `paseo run` creates agent `123456`
- **AND** the current thread's latest handoff sequence is `2`
- **THEN** `mfl run` prints `thread-id: <id>`
- **AND** it prints `worktree: <path>`
- **AND** it prints `agent-id: 123456`
- **AND** it prints `next-seq: 3`

#### Scenario: Failed Paseo run releases a fresh allocation

- **WHEN** `mfl run --id fix-test-ci "echo \"hello world\""` reserves a
  linked worktree
- **AND** the subsequent `paseo run` invocation fails before creating a usable agent
- **THEN** the command exits with an error that includes the `paseo run` failure
- **AND** the CLI removes the fresh `fix-test-ci` occupation from the shared database

#### Scenario: Malformed Paseo output fails before recording an agent

- **WHEN** `paseo run` exits successfully
- **AND** the CLI cannot determine the created Paseo agent id from the output
- **THEN** `mfl run` exits with a diagnostic explaining that the agent id could
  not be determined
- **AND** the CLI does not persist an ambiguous agent record

### Requirement: Running worktrees block duplicate thread launches

The CLI SHALL fail rather than launch a new thread in a worktree that already
has a running MeowFlow occupation. The CLI SHALL allow `mfl run --stage
<stage>` from the occupied worktree only when the requested stage belongs to
the same current thread and the thread is not archived.

#### Scenario: Selected worktree becomes occupied before launch

- **WHEN** `mfl run --id add-feature "echo \"hello world\""` selects a linked
  worktree as the candidate worktree
- **AND** another command records a running occupation for that worktree before
  the allocation insert completes
- **THEN** the command exits with an error explaining that a thread is already
  running in that worktree
- **AND** the command does not invoke `paseo run`

#### Scenario: Only registered worktree is already running a different thread

- **WHEN** a user runs `mfl run --id add-feature "echo \"hello world\""`
- **AND** the only configured registered linked worktree already has a running
  occupation for thread id `fix-test-ci`
- **THEN** the command exits with an error explaining that no idle thread
  worktree is available
- **AND** the command reports the occupying thread id `fix-test-ci`
- **AND** the command does not invoke `paseo run`

#### Scenario: Same-thread stage launch is allowed in an occupied worktree

- **WHEN** the current worktree is occupied by thread `fix-test-ci`
- **AND** the thread has an existing `meow-plan` agent
- **AND** a user runs `mfl run --stage code "implement the approved plan"`
- **THEN** the command launches a `meow-code` agent in the same worktree
- **AND** the command does not allocate another worktree
- **AND** the command output includes `agent-id:` and `next-seq:`

#### Scenario: Stage launch without stage is rejected after agents exist

- **WHEN** the current worktree is occupied by thread `fix-test-ci`
- **AND** the thread has at least one persisted agent
- **AND** a user runs `mfl run "implement the approved plan"`
- **THEN** the command exits with an error explaining that `--stage` is
  required after a thread already has agents
- **AND** the command does not invoke `paseo run`

#### Scenario: Archived thread cannot launch another stage

- **WHEN** the current worktree belongs to thread `fix-test-ci`
- **AND** the thread has a derived stage of `archived`
- **AND** a user runs `mfl run --stage code "continue"`
- **THEN** the command exits with an error explaining that archived threads
  cannot launch new stage agents
- **AND** the command does not invoke `paseo run`

### Requirement: Thread occupations are persisted in shared SQLite storage

The CLI SHALL store running thread occupation state in `~/.local/shared/meow-flow/meow-flow.sqlite` using the `better-sqlite3` package.

#### Scenario: First allocation creates the shared database

- **WHEN** a user runs `mfl run --id fix-test-ci "echo \"hello world\""`
- **AND** `~/.local/shared/meow-flow/meow-flow.sqlite` does not exist
- **THEN** the CLI creates the parent directory if needed
- **AND** the CLI creates the SQLite database and thread occupation schema
- **AND** the running occupation is persisted in that database

#### Scenario: Later list command reads the persisted allocation

- **WHEN** `mfl run --id fix-test-ci "echo \"hello world\""` has allocated `.paseo-workspaces/paseo-2`
- **AND** a later CLI process runs `mfl thread ls` in the same repository
- **THEN** the later process reads the allocation from `~/.local/shared/meow-flow/meow-flow.sqlite`
- **AND** the output reports `.paseo-workspaces/paseo-2 fix-test-ci`

### Requirement: Thread and workspace occupations are one-to-one

The occupation store SHALL prevent a thread id from running in more than one workspace and SHALL prevent a workspace from running more than one thread.

#### Scenario: Existing thread id fails clearly

- **WHEN** thread id `fix-test-ci` already occupies `.paseo-workspaces/paseo-2` in the current repository
- **AND** a user runs `mfl run --id fix-test-ci "echo \"hello world\""` from the same repository
- **THEN** the command exits with an error identifying the existing `.paseo-workspaces/paseo-2` allocation
- **AND** the CLI does not allocate any other workspace for `fix-test-ci`
- **AND** the CLI does not invoke `paseo run`

#### Scenario: Occupied workspace is skipped for a different thread id

- **WHEN** `.paseo-workspaces/paseo-1` is occupied by thread id `fix-test-ci`
- **AND** `.paseo-workspaces/paseo-2` is registered as a Git worktree and idle
- **AND** a user runs `mfl run --id add-feature "echo \"hello world\""`
- **THEN** the CLI allocates `.paseo-workspaces/paseo-2`
- **AND** the existing `fix-test-ci` occupation remains unchanged

#### Scenario: Thread id already allocated in another repository fails clearly

- **WHEN** thread id `fix-test-ci` already occupies a workspace for repository `/repo-a`
- **AND** a user runs `mfl run --id fix-test-ci "echo \"hello world\""` from repository `/repo-b`
- **THEN** the command exits with an error identifying the existing `/repo-a` allocation
- **AND** the command does not allocate a workspace in `/repo-b`

### Requirement: `mfl delete` releases running occupations by id

The CLI SHALL provide `mfl delete <id1> <id2> ...` to remove persisted running occupations for one or more thread ids from the shared SQLite database.

#### Scenario: Delete releases a single occupation

- **WHEN** thread id `fix-test-ci` occupies `.paseo-workspaces/paseo-2`
- **AND** a user runs `mfl delete fix-test-ci`
- **THEN** the CLI removes the `fix-test-ci` occupation from `~/.local/shared/meow-flow/meow-flow.sqlite`
- **AND** the command output identifies `fix-test-ci` and `.paseo-workspaces/paseo-2` as released

#### Scenario: Released workspace appears idle when listed

- **WHEN** thread id `fix-test-ci` occupied registered Git worktree `.paseo-workspaces/paseo-2`
- **AND** a user runs `mfl delete fix-test-ci`
- **AND** a later CLI process runs `mfl thread ls` in the same repository
- **THEN** the output reports `.paseo-workspaces/paseo-2 idle`

#### Scenario: Delete releases multiple occupations atomically

- **WHEN** thread id `fix-test-ci` occupies `.paseo-workspaces/paseo-1`
- **AND** thread id `add-feature` occupies `.paseo-workspaces/paseo-2`
- **AND** a user runs `mfl delete fix-test-ci add-feature`
- **THEN** the CLI removes both running occupations in one transaction
- **AND** the command output identifies both released thread ids

#### Scenario: Missing id prevents batch deletion

- **WHEN** thread id `fix-test-ci` occupies `.paseo-workspaces/paseo-1`
- **AND** no occupation exists for thread id `missing-thread`
- **AND** a user runs `mfl delete fix-test-ci missing-thread`
- **THEN** the command exits with an error identifying `missing-thread` as not found
- **AND** the `fix-test-ci` occupation remains in the shared database

#### Scenario: Delete does not remove the workspace folder

- **WHEN** thread id `fix-test-ci` occupies registered Git worktree `.paseo-workspaces/paseo-2`
- **AND** a user runs `mfl delete fix-test-ci`
- **THEN** `.paseo-workspaces/paseo-2` remains a registered Git worktree
- **AND** only the Meow Flow running occupation is removed
