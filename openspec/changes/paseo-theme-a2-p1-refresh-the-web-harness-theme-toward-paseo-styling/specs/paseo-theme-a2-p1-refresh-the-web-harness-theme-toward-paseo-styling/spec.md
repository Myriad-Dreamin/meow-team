## ADDED Requirements

### Requirement: Refresh the web harness theme toward Paseo styling

The system SHALL implement the approved proposal recorded in OpenSpec change
`paseo-theme-a2-p1-refresh-the-web-harness-theme-toward-paseo-styling` and
keep the work aligned with this proposal's objective: Materialize one OpenSpec
change that rethemes the Next.js web harness toward Paseo's current default
dark style by using `#101615` as the baseline background/canvas token and
replacing the current `Avenir Next` plus serif-heading mix with a neutral
system sans stack led by
`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`, while
loading the font direction in `app/layout.tsx`, retokening `app/globals.css`,
updating the main CSS modules that still hardcode the old blue palette, and
preserving layout and behavior.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Refresh the web harness theme toward Paseo styling" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

#### Scenario: Approved implementation applies the pinned theme contract

- **WHEN** the approved coder updates the default web harness styling
- **THEN** the shared shell canvas SHALL use `#101615` as its baseline background token
- **AND** the shell typography SHALL use the neutral system sans stack led by `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **AND** `app/layout.tsx`, `app/globals.css`, `components/team-status-bar.module.css`, `components/thread-detail-timeline.module.css`, `components/agent-task-output-window.module.css`, `components/codemirror-text-editor.module.css`, and `components/client-exception-surface.module.css` SHALL be updated as part of the approved retheme
- **AND** the implementation SHALL preserve existing layout, copy, flows, and behavior

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed
implementation branch and reusable worktree until human feedback explicitly
requests request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`style: align web harness styling with Paseo` and conventional-title metadata
`style` through the materialized OpenSpec artifacts without encoding the
metadata into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `style: align web harness styling with Paseo`
- **AND** the conventional-title metadata `style` SHALL remain explicit metadata instead of changing the proposal change path `paseo-theme-a2-p1-refresh-the-web-harness-theme-toward-paseo-styling`
