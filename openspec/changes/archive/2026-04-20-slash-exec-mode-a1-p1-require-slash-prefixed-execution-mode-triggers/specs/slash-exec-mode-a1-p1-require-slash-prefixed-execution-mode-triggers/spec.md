## ADDED Requirements

### Requirement: Slash-prefixed execution-mode parsing stays start-bound

The system SHALL recognize execution-mode input only when request content begins, after any leading whitespace, with `/execution `, `/benchmark `, or `/experiment `. After a valid match, the system SHALL persist the detected mode and strip the slash-prefixed token from the normalized request text before downstream planning logic consumes it.

#### Scenario: Leading slash command activates execution mode

- **WHEN** request content starts with `  /benchmark compare worktree reuse latency`
- **THEN** the system SHALL detect the execution mode as `benchmark`
- **AND** the normalized request text SHALL be `compare worktree reuse latency`

#### Scenario: Mid-sentence slash command does not activate execution mode

- **WHEN** request content is `please run /execution compare worktree reuse latency`
- **THEN** the system SHALL not detect an execution mode
- **AND** the request text SHALL remain unchanged for downstream planning

#### Scenario: Missing separating space does not activate execution mode

- **WHEN** request content starts with `/experiment`
- **THEN** the system SHALL not detect an execution mode
- **AND** the request text SHALL remain unchanged for downstream planning

### Requirement: Execution-mode autocomplete only appears for start-of-request slash input

The system SHALL offer execution-mode autocomplete suggestions only when the user is typing a slash-prefixed execution-mode command at the beginning of request content after any leading whitespace. The autocomplete system SHALL stop suggesting execution-mode completions for bare `execution`, `benchmark`, or `experiment` text that lacks the leading slash.

#### Scenario: Slash-prefixed partial input shows completions

- **WHEN** the user types `/ex` at the start of request content
- **THEN** the system SHALL offer execution-mode autocomplete suggestions
- **AND** the suggestions SHALL use slash-prefixed labels or insert text

#### Scenario: Bare mode name does not show completions

- **WHEN** the user types `execution` at the start of request content without a leading slash
- **THEN** the system SHALL not offer execution-mode autocomplete suggestions

#### Scenario: Slash command outside request start does not show completions

- **WHEN** the user types `compare this /be` after other request text
- **THEN** the system SHALL not offer execution-mode autocomplete suggestions

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `fix(execution-mode): Require slash execution triggers` and conventional-title metadata `fix(execution-mode)` through the materialized OpenSpec artifacts without changing the OpenSpec change name `slash-exec-mode-a1-p1-require-slash-prefixed-execution-mode-triggers`.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** `proposal.md`, `design.md`, `tasks.md`, and this spec SHALL reference the canonical request/PR title `fix(execution-mode): Require slash execution triggers`
- **AND** the conventional-title metadata SHALL remain `fix(execution-mode)`
