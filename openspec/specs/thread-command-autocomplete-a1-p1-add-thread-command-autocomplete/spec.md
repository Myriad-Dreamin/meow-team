# thread-command-autocomplete-a1-p1-add-thread-command-autocomplete Specification

## Purpose

Define inline slash-command autocomplete for the thread command editor,
including centralized command metadata, valid suggestion insertion, and
node-safe regression coverage while preserving existing parser and submission
semantics.
## Requirements
### Requirement: Thread command metadata stays centralized

The system SHALL define the supported thread commands `/approve`, `/ready`,
`/replan`, and `/replan-all` in shared metadata so the composer helper copy,
placeholder guidance, and autocomplete suggestions stay synchronized.

#### Scenario: Composer guidance uses one command source

- **WHEN** the thread command composer renders helper copy, placeholder
  guidance, and autocomplete suggestions
- **THEN** all three surfaces SHALL derive from the same ordered supported
  command definitions
- **AND** each command entry SHALL expose the syntax hint shown to the owner

### Requirement: The thread command editor suggests matching slash commands inline

The CodeMirror-based thread command editor SHALL detect the active
slash-command token and show only the supported commands whose names match the
current token prefix.

#### Scenario: Typing a partial slash command shows matching suggestions

- **WHEN** the owner types `/r` inside the active command token
- **THEN** the editor SHALL show matching suggestions for `/ready`, `/replan`,
  and `/replan-all`
- **AND** each suggestion SHALL display the full syntax hint for that command

#### Scenario: Non-command contexts do not keep the menu open

- **WHEN** the caret leaves the active command token or the editor becomes
  disabled
- **THEN** the autocomplete menu SHALL dismiss
- **AND** the composer SHALL continue to behave as the existing controlled
  thread command editor

### Requirement: Suggestion controls insert valid command drafts

The system SHALL let the owner move through autocomplete suggestions with arrow
keys, accept the active suggestion with `Tab`, `Enter`, or pointer selection,
and dismiss the menu with `Escape`.

#### Scenario: Accepting a suggestion replaces only the command token

- **WHEN** the owner accepts `/replan` while editing `/rep`
- **THEN** the editor SHALL replace only the active command token with the
  selected slash command
- **AND** SHALL leave the caret ready for the next argument
- **AND** SHALL NOT insert literal placeholders such as `[proposal-number]` or
  `requirement`

#### Scenario: Accepting a suggestion does not change submission semantics

- **WHEN** the owner accepts an autocomplete suggestion and continues editing or
  submits the command
- **THEN** the composer SHALL preserve the existing draft updates, submit
  gating, pending button text, disabled-state explanation copy, and inline
  notices
- **AND** the server SHALL continue to enforce the existing thread-command
  grammar

### Requirement: Autocomplete coverage stays node-safe

The repository SHALL include node-safe regression coverage for thread command
metadata plus autocomplete matching and insertion behavior, while keeping the
existing parser tests as the grammar authority.

#### Scenario: Metadata drift fails regression coverage

- **WHEN** helper copy, placeholder guidance, or autocomplete suggestions stop
  matching the shared supported-command metadata
- **THEN** the relevant Vitest coverage SHALL fail before the change is treated
  as complete

#### Scenario: Invalid insertion behavior fails regression coverage

- **WHEN** autocomplete matching or acceptance stops producing valid command
  drafts
- **THEN** the node-based regression suite SHALL fail before the change is
  treated as complete

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: enable thread command autocomplete` and conventional-title metadata
`feat` through the materialized OpenSpec artifacts without changing the
approved change path.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat: enable thread command autocomplete`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `thread-command-autocomplete-a1-p1-add-thread-command-autocomplete`
