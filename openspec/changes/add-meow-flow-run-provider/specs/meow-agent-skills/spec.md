## ADDED Requirements

### Requirement: Documentation describes MeowFlow run provider selection
MeowFlow documentation SHALL describe provider selection for staged launches,
including the `mfl run --provider <provider>` flag, the default provider
`claude`, the config file path `~/.local/share/meow-flow/config.json`, and
`paseo provider ls` as the provider discovery command.

#### Scenario: README documents the provider flag
- **WHEN** a user opens the root README or `packages/meow-flow/README.md`
- **THEN** it documents `mfl run --provider <provider>`
- **AND** it explains that the flag applies to plan and continuation stage
  launches

#### Scenario: README documents the provider config
- **WHEN** a user opens the root README or `packages/meow-flow/README.md`
- **THEN** it documents `~/.local/share/meow-flow/config.json`
- **AND** it shows that the provider default can be configured with a
  top-level `provider` field
- **AND** it states that `claude` is used when no flag or config provider is
  set
- **AND** it points users to `paseo provider ls` for available provider values

## MODIFIED Requirements

### Requirement: The `meow-flow` skill handles `/meow-flow` and `/mfl`

The `meow-flow` skill SHALL trigger when an agent chat starts with
`/meow-flow [content]` or `/mfl [content]` and SHALL use `mfl` CLI state as the
source of truth for worktree occupancy, current thread, stage dispatch, and
handoff coordination. The entry command SHALL allow an optional
`--provider <provider>` argument for the first plan launch and SHALL pass that
argument to `mfl run --provider <provider>` when present. When no explicit
provider is present, the entry command SHALL rely on `mfl run` provider
resolution.

#### Scenario: Initial request starts a plan agent in an idle worktree
- **WHEN** a user sends `/meow-flow implement user authentication`
- **AND** `mfl status` reports an idle MeowFlow worktree
- **THEN** the skill runs `mfl run --stage plan "implement user authentication"`
- **AND** the skill reports the returned `agent-id` and `next-seq`
- **AND** the user is directed to continue in the new plan agent chat

#### Scenario: Initial request starts a plan agent with explicit provider
- **WHEN** a user sends
  `/meow-flow --provider codex/gpt-5.4 implement user authentication`
- **AND** `mfl status` reports an idle MeowFlow worktree
- **THEN** the skill runs
  `mfl run --stage plan --provider codex/gpt-5.4 "implement user authentication"`
- **AND** the skill reports the returned `agent-id` and `next-seq`
- **AND** the user is directed to continue in the new plan agent chat

#### Scenario: Alias starts the same entry flow
- **WHEN** a user sends `/mfl implement user authentication`
- **THEN** the skill follows the same behavior as
  `/meow-flow implement user authentication`

#### Scenario: Repository root without a worktree suggests creating one
- **WHEN** `mfl status` reports that the current directory is the repository
  root and no MeowFlow worktree is available for the current thread
- **THEN** the skill tells the user to create a worktree with
  `mfl worktree new`
- **AND** the skill does not launch a stage agent

#### Scenario: Occupied worktree asks how to proceed
- **WHEN** `mfl status` reports that the worktree is occupied by thread
  `install-meow-flow-skills`
- **AND** the active Paseo agent id is `123456`
- **THEN** the skill reports that the worktree is occupied by thread
  `install-meow-flow-skills` and Paseo agent `123456`
- **AND** the skill asks how the user wants to proceed with that existing
  thread instead of creating a duplicate thread

### Requirement: The `meow-flow` skill dispatches staged continuation actions

The `meow-flow` skill SHALL support `/mfl plan`, `/mfl code`, `/mfl review`,
`/mfl execute`, and `/mfl validate` continuation actions by launching the
corresponding stage agent through `mfl run --stage <stage>`. Each staged
continuation action SHALL allow an optional `--provider <provider>` argument
and SHALL pass it to `mfl run --provider <provider>` when present. When no
explicit provider is present, staged continuation actions SHALL rely on
`mfl run` provider resolution.

#### Scenario: Code continuation starts a code stage agent
- **WHEN** a user sends `/mfl code also update tests`
- **AND** the current chat belongs to an active MeowFlow thread
- **THEN** the skill runs `mfl run --stage code "also update tests"`
- **AND** the skill tells the user to continue in the new stage agent chat

#### Scenario: Code continuation starts a code stage agent with explicit provider
- **WHEN** a user sends `/mfl code --provider claude/sonnet also update tests`
- **AND** the current chat belongs to an active MeowFlow thread
- **THEN** the skill runs
  `mfl run --stage code --provider claude/sonnet "also update tests"`
- **AND** the skill tells the user to continue in the new stage agent chat

#### Scenario: Review continuation starts a review stage agent
- **WHEN** a user sends `/mfl review`
- **AND** the current chat belongs to an active MeowFlow thread
- **THEN** the skill runs `mfl run --stage review`
- **AND** the new agent reads the current thread status and recent handoffs

#### Scenario: Commit action finalizes current changes
- **WHEN** a user returns to an older MeowFlow agent chat and sends
  `/mfl commit`
- **THEN** the skill reads new handoffs from the thread
- **AND** the skill commits with a suitable title
- **AND** the skill pushes the changes when the repository remote is
  configured for the current branch

#### Scenario: Archive action delegates to archive behavior
- **WHEN** a user sends `/mfl archive`
- **THEN** the skill follows the same current-thread archive behavior as
  `/meow-archive`

#### Scenario: Delete action delegates to proposal deletion behavior
- **WHEN** a user sends `/mfl delete`
- **THEN** the skill follows the same current-thread delete behavior as
  `/meow-archive delete`
- **AND** the skill does not revert code changes
