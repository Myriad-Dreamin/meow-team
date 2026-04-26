## ADDED Requirements

### Requirement: `mfl run` resolves a Paseo provider
The CLI SHALL accept `mfl run --provider <provider>` and SHALL resolve the
provider for each staged launch using this precedence order: explicit CLI flag,
then `provider` from `~/.local/share/meow-flow/config.json`, then the default
provider `claude`. Provider values SHALL be trimmed non-empty strings and SHALL
be passed through as Paseo provider values without MeowFlow maintaining a
separate provider allow-list.

#### Scenario: Explicit provider wins
- **WHEN** a user runs
  `mfl run --provider codex/gpt-5.4 --id fix-test-ci "add auth"`
- **AND** `~/.local/share/meow-flow/config.json` contains
  `{"provider":"opencode"}`
- **THEN** the CLI resolves provider `codex/gpt-5.4`
- **AND** the subsequent `paseo run` invocation includes
  `--provider codex/gpt-5.4`

#### Scenario: Configured provider is used by default
- **WHEN** a user runs `mfl run --id fix-test-ci "add auth"`
- **AND** `~/.local/share/meow-flow/config.json` contains
  `{"provider":"opencode"}`
- **THEN** the CLI resolves provider `opencode`
- **AND** the subsequent `paseo run` invocation includes `--provider opencode`

#### Scenario: Missing config uses Claude
- **WHEN** a user runs `mfl run --id fix-test-ci "add auth"`
- **AND** no run-provider config value is available
- **THEN** the CLI resolves provider `claude`
- **AND** the subsequent `paseo run` invocation includes `--provider claude`

#### Scenario: Invalid provider config fails clearly
- **WHEN** `~/.local/share/meow-flow/config.json` exists
- **AND** its `provider` field is present but is not a non-empty string
- **AND** a user runs `mfl run --id fix-test-ci "add auth"`
- **THEN** the command exits with an error identifying the invalid config
  value
- **AND** the error mentions `paseo provider ls` as the way to discover valid
  provider values
- **AND** the command does not mutate thread occupations
- **AND** the command does not invoke `paseo run`

## MODIFIED Requirements

### Requirement: `mfl run` launches a labeled Paseo agent with the request body
The CLI SHALL invoke `paseo run` with a labeled stage prompt after resolving
the thread, stage, and provider. The invocation uses the target worktree as
cwd, includes `--provider <resolved-provider>`, includes
`--label x-meow-flow-id=<resolved-id>`, and includes the request body unchanged
inside the MeowFlow stage prompt. The command SHALL parse the created Paseo
agent id, persist the agent metadata when available, and print `agent-id:
<id>` plus `next-seq: <seq>`.

#### Scenario: Fresh allocation launches Paseo run with a plan prompt
- **WHEN** a user runs `mfl run --id fix-test-ci "echo \"hello world\""`
- **AND** the second linked worktree is selected as the idle registered
  worktree
- **AND** the resolved provider is `claude`
- **THEN** the CLI invokes `paseo run` with cwd set to the absolute worktree
  path
- **AND** the `paseo run` invocation includes `--provider claude`
- **AND** the `paseo run` invocation includes
  `--label x-meow-flow-id=fix-test-ci`
- **AND** the `paseo run` invocation includes a `meow-plan` prompt
- **AND** the stage prompt includes `echo "hello world"` unchanged

#### Scenario: Generated id is used as the Paseo label
- **WHEN** a user runs `mfl run "echo \"hello world\""`
- **AND** the generated thread id is `11111111-1111-4111-8111-111111111111`
- **THEN** the `paseo run` invocation includes
  `--label x-meow-flow-id=11111111-1111-4111-8111-111111111111`

#### Scenario: Explicit provider is passed to Paseo
- **WHEN** a user runs
  `mfl run --provider codex/gpt-5.4 --id fix-test-ci "echo \"hello world\""`
- **AND** a linked worktree is selected
- **THEN** the `paseo run` invocation includes `--provider codex/gpt-5.4`

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
