## ADDED Requirements

### Requirement: Scope shared harness form styles safely

The system SHALL implement the approved proposal recorded in OpenSpec change
`style-scopes-a1-p1-scope-shared-harness-form-styles-safely` and keep the work
aligned with this proposal's objective: rename the generic shared form
selectors in `app/globals.css` to app-specific scoped names, update every
affected component usage, and keep the current form layout and interaction
styles intact while preventing external `.field` collisions.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Scope shared harness form styles safely"
  proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and
  machine-review workflow

#### Scenario: Shared form selectors use an app-owned namespace

- **WHEN** the coder updates the shared harness form styling
- **THEN** the selectors that previously used generic names such as `field`,
  `field-row`, and `field-hint` SHALL be renamed to one harness-owned scoped
  naming family
- **AND** the shared style block in `app/globals.css` SHALL remain grouped so
  future additions do not reintroduce unsafe generic selector names

### Requirement: Preserve existing harness form behavior

The harness UI SHALL preserve the current shared form layout and interaction
behavior after the selector rename across the team console, thread command
composer, thread status board, and thread detail timeline.

#### Scenario: Row and hint styling stay intact

- **WHEN** the renamed shared selectors are applied in affected components
- **THEN** the two-column field row layout and field hint presentation SHALL
  remain visually equivalent to the current harness behavior

#### Scenario: Textarea interaction styling remains available

- **WHEN** a shared harness textarea receives focus or overflows
- **THEN** the renamed selector family SHALL continue to provide the existing
  focus and scrollbar-related styling used by the harness forms

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed
implementation branch and reusable worktree until human feedback explicitly
requests request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a
  reusable worktree from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`fix: scope shared form styles safely` and conventional-title metadata `fix`
through the materialized OpenSpec artifacts without changing the proposal
change path
`style-scopes-a1-p1-scope-shared-harness-form-styles-safely`.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `fix: scope shared form styles safely`
- **AND** the conventional-title metadata SHALL remain `fix`
