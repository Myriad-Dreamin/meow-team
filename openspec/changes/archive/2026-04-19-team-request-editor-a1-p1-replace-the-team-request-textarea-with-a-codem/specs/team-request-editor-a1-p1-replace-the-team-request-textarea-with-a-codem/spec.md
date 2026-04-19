## ADDED Requirements

### Requirement: Continuous Assignment Console uses a CodeMirror request editor

The system SHALL replace the Continuous Assignment Console `Request` textarea
with a CodeMirror-based editor while keeping the request field scoped to the
existing `TeamConsole` planner form.

#### Scenario: Idle console shows the CodeMirror request editor

- **WHEN** the Continuous Assignment Console renders while planning is idle
- **THEN** the `Request` field SHALL render a CodeMirror-based editor in place
  of the plain `<textarea>`
- **AND** SHALL keep the existing request placeholder guidance and submit
  control visible in the same planner form

#### Scenario: Disabled or busy console keeps the editor read-only

- **WHEN** the console is disabled or a planner run is already in progress
- **THEN** the request editor SHALL become read-only
- **AND** the surrounding submit controls SHALL keep the existing disabled or
  busy gating behavior

### Requirement: Request editor swap preserves the current request lifecycle

The CodeMirror request editor SHALL preserve the current `prompt` lifecycle,
including form submission, whitespace trimming, branch deletion reruns, and
the existing planner request payload.

#### Scenario: Typing updates the existing prompt state

- **WHEN** the owner types into the CodeMirror request editor
- **THEN** `TeamConsole` SHALL update the same `prompt` state that the current
  textarea uses
- **AND** planner submission SHALL continue to send the request through the
  existing form workflow

#### Scenario: Branch deletion rerun reuses the same request text

- **WHEN** the planner requests branch deletion confirmation and the owner
  chooses to continue
- **THEN** the rerun SHALL reuse the same request text, title, thread id, and
  repository selection that were active before the confirmation prompt
- **AND** replacing the editor surface SHALL NOT change that rerun contract

### Requirement: Execution-mode autocomplete uses shared canonical prefixes

The request editor SHALL suggest execution-mode prefixes from shared metadata
in `lib/team/execution-mode.ts`, and the same metadata SHALL define the parser
contract for accepted execution modes.

#### Scenario: Start-of-request autocomplete suggests canonical prefixes

- **WHEN** the owner focuses the request editor or types a partial
  execution-mode prefix at the start of the request
- **THEN** the editor SHALL suggest only `execution:`, `benchmark:`, and
  `experiment:`
- **AND** the suggestion labels or helper copy SHALL match the same canonical
  prefixes that planner parsing accepts

#### Scenario: Unsupported slash prefixes are not suggested

- **WHEN** the owner opens request-editor autocomplete
- **THEN** the editor SHALL NOT suggest slash-prefixed execution-mode forms
  that the approved execute-mode spec does not accept
- **AND** the UI SHALL avoid presenting parser-invalid prefixes as valid

### Requirement: Execution-mode parsing matches the approved colon syntax

The planner SHALL parse execution-mode requests according to the approved
colon-prefixed contract and strip the accepted prefix from the canonical
request text that downstream planning uses.

#### Scenario: Colon-prefixed request becomes an execution-mode assignment

- **WHEN** the request input starts with `benchmark: compare worktree reuse latency`
- **THEN** the parser SHALL persist the execution mode as `benchmark`
- **AND** SHALL return `compare worktree reuse latency` as the canonical
  request text
- **AND** SHALL expose `benchmark:` as the normalized prefix metadata

#### Scenario: Unprefixed request remains unchanged

- **WHEN** the request input does not start with an approved execution-mode
  prefix
- **THEN** the parser SHALL leave the request text unchanged
- **AND** SHALL return no execution-mode metadata

### Requirement: Focused regression coverage protects the request editor contract

The repository SHALL include focused regression coverage for the request
editor surface and the shared execution-mode prefix contract under the current
Vitest constraints.

#### Scenario: Prefix drift fails focused tests

- **WHEN** parser behavior, autocomplete suggestions, or helper copy drifts
  away from the approved `mode:` prefixes
- **THEN** focused Vitest coverage SHALL fail before the change is treated as
  complete

#### Scenario: Request editor markup remains regression-tested

- **WHEN** the request editor stops rendering the expected CodeMirror surface
  or loses the current disabled or busy contract
- **THEN** focused regression coverage SHALL fail before the planner UI change
  is accepted

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: replace team request editor` and conventional-title metadata `feat`
through the materialized OpenSpec artifacts without encoding slash-delimited
roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat: replace team request editor`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `team-request-editor-a1-p1-replace-the-team-request-textarea-with-a-codem`
