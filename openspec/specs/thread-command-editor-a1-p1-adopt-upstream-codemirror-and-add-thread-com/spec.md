# thread-command-editor-a1-p1-adopt-upstream-codemirror-and-add-thread-com Specification

## Purpose
Define the thread-command editor surface that adopts upstream CodeMirror,
preserves the current command-composer lifecycle, and adds assignment-aware
autocomplete for the supported slash commands.
## Requirements
### Requirement: Thread detail uses the upstream CodeMirror command editor

The selected thread detail view SHALL replace the local
`packages/codemirror` shim with the upstream CodeMirror 5 distribution for the
thread command editor while keeping the composer scoped to the current thread's
latest assignment.

#### Scenario: Idle thread shows the upstream editor

- **WHEN** a user opens a selected thread whose latest assignment is available
  for thread commands
- **THEN** the thread detail SHALL render an upstream CodeMirror-based command
  editor plus the existing submit control
- **AND** SHALL keep the current helper copy and placeholder guidance for the
  supported slash commands

#### Scenario: Editor initialization failure preserves the composer shell

- **WHEN** the upstream editor runtime cannot initialize in the browser
- **THEN** the thread command composer SHALL keep rendering its surrounding
  shell, helper copy, and submit controls without crashing the selected thread
  detail view

### Requirement: Autocomplete suggests supported commands and latest-assignment proposals

The thread command composer SHALL provide client-side autocomplete for only the
supported slash commands and SHALL derive proposal-number suggestions from the
current thread's latest assignment state.

#### Scenario: Slash-command suggestions stay explicit

- **WHEN** the owner types `/` or a partial slash-command prefix into the
  editor
- **THEN** the composer SHALL suggest only `/approve`, `/ready`, `/replan`,
  and `/replan-all`
- **AND** SHALL present syntax guidance that matches the command helper text

#### Scenario: Proposal-number suggestions use latest-assignment lane indexes

- **WHEN** the owner types `/approve `, `/ready `, or `/replan ` for a thread
  whose latest assignment contains proposal lanes
- **THEN** the composer SHALL suggest proposal numbers from that latest
  assignment's `laneIndex` values
- **AND** SHALL NOT suggest historical assignments, unrelated lane IDs, or
  proposal numbers outside the selected thread

#### Scenario: Requirement-only commands stay free-form

- **WHEN** the owner types `/replan-all ` or finishes selecting a proposal
  number for `/replan`
- **THEN** the composer SHALL allow free-form requirement text entry without
  requesting a new autocomplete API or changing backend command behavior

### Requirement: Shared command metadata keeps syntax copy aligned

The system SHALL define shared thread-command metadata so helper text,
placeholder text, parser-facing syntax copy, and autocomplete suggestions stay
aligned for the supported commands.

#### Scenario: Shared metadata updates helper and autocomplete copy together

- **WHEN** the supported thread-command syntax is revised in the shared
  metadata source
- **THEN** the helper text, placeholder guidance, and autocomplete suggestions
  SHALL reflect the same command forms that the parser accepts

#### Scenario: Unsupported commands never appear in suggestions

- **WHEN** the owner requests autocomplete suggestions in the thread command
  editor
- **THEN** the composer SHALL exclude commands outside the parser-supported
  set

### Requirement: Editor swap preserves the current command lifecycle

The upstream editor and autocomplete integration SHALL preserve the existing
thread-command draft state, submit gating, disabled reasons, pending state, and
inline result notices.

#### Scenario: Draft updates and submit gating remain unchanged

- **WHEN** the owner types or accepts an autocomplete suggestion in the editor
- **THEN** the composer SHALL update the same thread-command draft state used
  by the selected thread detail panel
- **AND** SHALL keep the submit control disabled for empty or whitespace-only
  drafts and enabled for non-empty slash commands

#### Scenario: Disabled threads remain read-only and explanatory

- **WHEN** the selected thread is archived, has no latest assignment yet, is
  being replanned, or still has queued, coding, or reviewing work
- **THEN** the thread detail SHALL disable the upstream editor and submit
  control
- **AND** SHALL keep the existing disabled-state explanation copy visible

#### Scenario: Pending and result notices stay inline

- **WHEN** the owner submits a supported slash command through the upstream
  editor after typing or selecting autocomplete suggestions
- **THEN** the composer SHALL use the existing command submission flow and
  pending-state button copy
- **AND** SHALL continue to render the latest success or error notice inline
  after the request resolves

### Requirement: Coverage and dependency contract stay explicit

The repository SHALL update regression coverage and dependency guards for the
upstream CodeMirror package, shared command metadata, and autocomplete behavior
under the current Vitest constraints.

#### Scenario: Review guards track the upstream dependency contract

- **WHEN** focused review coverage inspects the thread command editor
  dependency
- **THEN** the repository SHALL assert the approved upstream `codemirror`
  package contract instead of the removed `workspace:*` shim contract

#### Scenario: Autocomplete and syntax drift fail tests

- **WHEN** helper text, placeholder guidance, autocomplete sources, or
  assignment-aware proposal-number behavior drift from the approved command
  syntax
- **THEN** focused regression coverage SHALL fail before the change is treated
  as complete

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: integrate upstream CodeMirror command autocomplete` and
conventional-title metadata `feat` through the materialized OpenSpec artifacts
without encoding slash-delimited roadmap/topic scope into `branchPrefix` or
OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat: integrate upstream CodeMirror command autocomplete`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `thread-command-editor-a1-p1-adopt-upstream-codemirror-and-add-thread-com`
