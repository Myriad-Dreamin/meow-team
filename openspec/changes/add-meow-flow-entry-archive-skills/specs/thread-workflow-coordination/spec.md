## ADDED Requirements

### Requirement: `mfl status` reports the current MeowFlow thread context

The CLI SHALL provide `mfl status` to report whether the current directory is
inside an active MeowFlow workspace, an idle MeowFlow workspace, the repository
root, or outside a git repository.

#### Scenario: Status reports occupied workspace

- **WHEN** the current directory is inside a linked MeowFlow workspace
- **AND** that workspace is occupied by thread `install-meow-flow-skills`
- **AND** the latest known Paseo agent id for that thread is `123456`
- **THEN** `mfl status` reports that the workspace is occupied by thread
  `install-meow-flow-skills`
- **AND** it reports Paseo agent id `123456`

#### Scenario: Status suggests workspace creation from repository root

- **WHEN** the current directory is the root checkout for a git repository
- **AND** no current MeowFlow thread is associated with that checkout
- **THEN** `mfl status` reports that no MeowFlow workspace is selected
- **AND** it suggests `mfl workspace new`

#### Scenario: Status fails outside git

- **WHEN** a user runs `mfl status` outside a git-managed folder
- **THEN** the command exits with a diagnostic explaining that it must be run
  inside a git repository or MeowFlow workspace

### Requirement: `mfl workspace` aliases the existing worktree commands

The CLI SHALL provide `mfl workspace` as an alias for the existing
`mfl worktree` command group so user-facing thread guidance can use the
workspace term without removing worktree commands.

#### Scenario: Workspace new creates the next linked worktree

- **WHEN** a user runs `mfl workspace new`
- **THEN** the CLI performs the same operation as `mfl worktree new`
- **AND** the output identifies the created linked workspace path

#### Scenario: Workspace list matches worktree list

- **WHEN** a user runs `mfl workspace ls`
- **THEN** the CLI performs the same operation as `mfl worktree ls`

### Requirement: `mfl thread status` renders persisted thread metadata

The CLI SHALL provide `mfl thread status <id> --no-color` and SHALL render the
thread name, agents, request body, and handoffs in a deterministic
YAML-compatible shape.

#### Scenario: Thread status prints the sample fields

- **WHEN** thread `fix-test-ci` has name `install-meow-flow-skills`
- **AND** it has one agent with id `123456`, title `paseo recorded title`, and
  skill `meow-plan`
- **AND** its request body is `the content of request`
- **AND** it has a handoff with sequence `1`, stage `code`, and content
  `code diff`
- **THEN** `mfl thread status fix-test-ci --no-color` prints `name:
  install-meow-flow-skills`
- **AND** it prints an `agents` list containing id `123456`, the title, the
  skill, and an RFC 3339 creation timestamp
- **AND** it prints `request-body: |` followed by the request content
- **AND** it prints a `handoffs` list containing `seq: 1`, `stage: code`, the
  content, and an RFC 3339 creation timestamp

#### Scenario: Missing thread status fails clearly

- **WHEN** no thread exists with id `missing-thread`
- **THEN** `mfl thread status missing-thread --no-color` exits with an error
  identifying `missing-thread` as missing

### Requirement: `mfl thread set name` updates the current thread name

The CLI SHALL provide `mfl thread set name <name>` to update the current
thread's readable name.

#### Scenario: Plan agent sets a readable thread name

- **WHEN** the current workspace belongs to thread `fix-test-ci`
- **AND** a plan agent runs `mfl thread set name 'install-meow-flow-skills'`
- **THEN** the thread status for `fix-test-ci` reports name
  `install-meow-flow-skills`

#### Scenario: Empty thread name is rejected

- **WHEN** a user runs `mfl thread set name ''`
- **THEN** the command exits with an error explaining that the thread name must
  not be empty

### Requirement: `mfl agent update-self` records current agent metadata

The CLI SHALL provide `mfl agent update-self` to detect the current Paseo agent,
infer the active `meow-*` skill from agent metadata or logs, call
`paseo agent update` with MeowFlow metadata, and persist the agent record in
the current thread info.

#### Scenario: Agent self update records a plan agent

- **WHEN** the current chat is Paseo agent `123456`
- **AND** the agent logs show that `meow-plan` is active
- **AND** the current workspace belongs to thread `fix-test-ci`
- **THEN** `mfl agent update-self` calls `paseo agent update` for agent
  `123456` with MeowFlow thread metadata
- **AND** thread status for `fix-test-ci` includes agent `123456` with skill
  `meow-plan`

#### Scenario: Unsupported skill inference fails clearly

- **WHEN** the current chat is Paseo agent `123456`
- **AND** the CLI cannot infer a supported `meow-*` skill from metadata or
  logs
- **THEN** `mfl agent update-self` exits with a diagnostic explaining that the
  agent skill could not be detected
- **AND** it does not write an ambiguous agent record

### Requirement: Thread stage is derived from agent skills

The CLI SHALL derive a thread's current stage from the list of persisted
agents rather than storing a separate durable stage field on the agent record.

#### Scenario: Empty thread derives plan stage

- **WHEN** a thread has no persisted agents
- **THEN** the derived next default stage is `plan`

#### Scenario: Agent skill maps to stage

- **WHEN** a thread has a latest agent whose skill is `meow-code`
- **THEN** the derived latest stage is `code`

#### Scenario: Archive agent derives archived state

- **WHEN** a thread has an agent whose skill is `meow-archive`
- **THEN** the thread's derived stage is `archived`

### Requirement: `mfl handoff append` records stage handoffs

The CLI SHALL provide `mfl handoff append --stage <stage> <content>` to append
a compact handoff to the current thread with a monotonically increasing
sequence number.

#### Scenario: Append code handoff

- **WHEN** the current thread has no handoffs
- **AND** a code agent runs
  `mfl handoff append --stage code "code diff summary"`
- **THEN** the CLI records a handoff with sequence `1`
- **AND** the handoff has stage `code`
- **AND** the handoff content is `code diff summary`

#### Scenario: Append returns the assigned sequence

- **WHEN** the current thread's latest handoff sequence is `2`
- **AND** a review agent appends a handoff
- **THEN** the command records sequence `3`
- **AND** the command output identifies sequence `3`

### Requirement: `mfl handoff get` reads recent or since-sequence handoffs

The CLI SHALL provide `mfl handoff get -n <count>` and
`mfl handoff get --since <seq>` for reading handoffs from the current thread.

#### Scenario: Get last handoff

- **WHEN** the current thread has handoffs with sequences `1`, `2`, and `3`
- **AND** a user runs `mfl handoff get -n 1`
- **THEN** the output includes only handoff sequence `3`

#### Scenario: Get handoffs since a sequence

- **WHEN** the current thread has handoffs with sequences `1`, `2`, and `3`
- **AND** a user runs `mfl handoff get --since 2`
- **THEN** the output includes handoff sequences `2` and `3`
- **AND** the output does not include handoff sequence `1`

### Requirement: `mfl thread archive` archives the current thread and releases the workspace

The CLI SHALL provide `mfl thread archive` to mark the current thread archived
and release the occupied workspace without deleting the workspace folder or
reverting code changes.

#### Scenario: Archive releases current workspace

- **WHEN** the current workspace is occupied by thread `fix-test-ci`
- **AND** a user runs `mfl thread archive`
- **THEN** the CLI marks thread `fix-test-ci` archived
- **AND** it releases the workspace occupation
- **AND** it does not delete the workspace folder

#### Scenario: Archived thread appears archived in status

- **WHEN** thread `fix-test-ci` was archived
- **THEN** `mfl thread status fix-test-ci --no-color` reports the archived
  state

#### Scenario: Archive without current thread fails clearly

- **WHEN** a user runs `mfl thread archive` outside an occupied MeowFlow thread
- **THEN** the command exits with a diagnostic explaining that no current
  MeowFlow thread could be resolved
