## ADDED Requirements

### Requirement: Embedded MeowFlow skills expose the core entry and archive skills

The embedded skill set SHALL include `meow-flow` and `meow-archive`, SHALL
continue to include the role skills `meow-plan`, `meow-code`, `meow-review`,
`meow-execute`, `meow-validate`, and `meow-dataset`, and SHALL exclude the
legacy `team-harness-workflow` skill.

#### Scenario: Listing embedded skills shows the MeowFlow entry skills

- **WHEN** a user runs `mfl install-skills --list`
- **THEN** the output includes `meow-flow`
- **AND** the output includes `meow-archive`
- **AND** the output includes `meow-plan`, `meow-code`, `meow-review`,
  `meow-execute`, `meow-validate`, and `meow-dataset`
- **AND** the output does not include `team-harness-workflow`

#### Scenario: Installing skills writes the core skill files

- **WHEN** a user runs `mfl install-skills codex`
- **THEN** the Codex skill target contains `meow-flow/SKILL.md`
- **AND** the Codex skill target contains `meow-archive/SKILL.md`
- **AND** the Codex skill target does not contain
  `team-harness-workflow/SKILL.md`

### Requirement: The `meow-flow` skill handles `/meow-flow` and `/mfl`

The `meow-flow` skill SHALL trigger when an agent chat starts with
`/meow-flow [content]` or `/mfl [content]` and SHALL use `mfl` CLI state as the
source of truth for workspace occupancy, current thread, stage dispatch, and
handoff coordination.

#### Scenario: Initial request starts a plan agent in an idle workspace

- **WHEN** a user sends `/meow-flow implement user authentication`
- **AND** `mfl status` reports an idle MeowFlow workspace
- **THEN** the skill runs `mfl run --stage plan "implement user authentication"`
- **AND** the skill reports the returned `agent-id` and `next-seq`
- **AND** the user is directed to continue in the new plan agent chat

#### Scenario: Alias starts the same entry flow

- **WHEN** a user sends `/mfl implement user authentication`
- **THEN** the skill follows the same behavior as
  `/meow-flow implement user authentication`

#### Scenario: Repository root without a workspace suggests creating one

- **WHEN** `mfl status` reports that the current directory is the repository
  root and no MeowFlow workspace is available for the current thread
- **THEN** the skill tells the user to create a workspace with
  `mfl workspace new`
- **AND** the skill does not launch a stage agent

#### Scenario: Occupied workspace asks how to proceed

- **WHEN** `mfl status` reports that the workspace is occupied by thread
  `install-meow-flow-skills`
- **AND** the active Paseo agent id is `123456`
- **THEN** the skill reports that the workspace is occupied by thread
  `install-meow-flow-skills` and Paseo agent `123456`
- **AND** the skill asks how the user wants to proceed with that existing
  thread instead of creating a duplicate thread

### Requirement: The `meow-flow` skill dispatches staged continuation actions

The `meow-flow` skill SHALL support `/mfl plan`, `/mfl code`, `/mfl review`,
`/mfl execute`, and `/mfl validate` continuation actions by launching the
corresponding stage agent through `mfl run --stage <stage>`.

#### Scenario: Code continuation starts a code stage agent

- **WHEN** a user sends `/mfl code also update tests`
- **AND** the current chat belongs to an active MeowFlow thread
- **THEN** the skill runs `mfl run --stage code "also update tests"`
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

### Requirement: Role skills use the core thread workflow

Role skills SHALL refer to the `meow-flow` skill for shared thread behavior.
This applies to `meow-plan`, `meow-code`, `meow-review`, `meow-execute`, and
`meow-validate` before they apply role-specific rules for planning,
implementation, review, execution, or validation.

#### Scenario: Code skill reads thread context before implementation

- **WHEN** a code stage agent starts from `mfl run --stage code`
- **THEN** `meow-code` uses the core `meow-flow` workflow to read the current
  thread status
- **AND** it reads recent handoffs before choosing the implementation source of
  truth

#### Scenario: Stage agent appends a compact handoff before finishing

- **WHEN** a `meow-code`, `meow-review`, `meow-execute`, or `meow-validate`
  stage agent completes its work
- **THEN** the skill records a short handoff with
  `mfl handoff append --stage <stage> <handoff-content>`
- **AND** the handoff content summarizes the produced diff, review comments,
  execution result, or validation result

### Requirement: Plan skill names the thread and creates the proposal

When `meow-plan` is launched by `mfl run --stage plan`, it SHALL choose a
readable unused thread name unless the user requested an existing branch or
name, persist that name, create an OpenSpec proposal with the same name when
OpenSpec is present, and commit the proposal.

#### Scenario: Plan agent creates an OpenSpec proposal with the thread name

- **WHEN** a plan agent receives the request `add meow-flow skills`
- **AND** the readable unused name is `install-meow-flow-skills`
- **THEN** the agent runs `mfl thread set name 'install-meow-flow-skills'`
- **AND** the agent creates an OpenSpec change named
  `install-meow-flow-skills`
- **AND** the agent commits the proposal artifacts

#### Scenario: Plan agent respects repository commit title configuration

- **WHEN** `git config --local paseo.prompt.title` defines a commit title
  preference
- **THEN** the plan agent uses that preference for the proposal commit title
- **AND** otherwise it infers the local format from recent main-branch titles
- **AND** the conventional fallback is `docs: add proposal <name>`

### Requirement: The `meow-archive` skill archives the current thread

The `meow-archive` skill SHALL trigger on `/meow-archive` and
`/meow-archive delete`, resolve the current MeowFlow thread, and archive or
delete the associated OpenSpec proposal according to the requested variant.

#### Scenario: Normal archive archives proposal and thread

- **WHEN** a user sends `/meow-archive`
- **AND** the current thread has an OpenSpec proposal
- **THEN** the skill archives the OpenSpec proposal using the repository's
  OpenSpec archive workflow
- **AND** the skill runs `mfl thread archive` to release the workspace

#### Scenario: Delete archive removes the proposal without reverting code

- **WHEN** a user sends `/meow-archive delete`
- **AND** the current thread has an open OpenSpec proposal
- **THEN** the skill removes the open proposal artifacts
- **AND** the skill does not revert code changes
- **AND** the skill runs `mfl thread archive` to release the workspace

#### Scenario: Archive still works without OpenSpec

- **WHEN** a user sends `/meow-archive delete`
- **AND** the current repository does not use OpenSpec
- **THEN** the skill runs `mfl thread archive`
- **AND** the skill reports that no OpenSpec proposal was archived or deleted
