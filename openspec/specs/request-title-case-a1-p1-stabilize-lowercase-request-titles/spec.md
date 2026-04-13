# request-title-case-a1-p1-stabilize-lowercase-request-titles Specification

## Purpose

Define the request-title canonicalization capability for the harness so
single-proposal planning metadata, canonical request titles, and PR titles keep
the approved lowercase-initial subject while conventional title metadata stays
explicit.

## Requirements

### Requirement: stabilize lowercase request titles

The system SHALL implement the approved proposal recorded in OpenSpec change `request-title-case-a1-p1-stabilize-lowercase-request-titles`
and keep the work aligned with this proposal's objective: Repair the canonical title pipeline so single-proposal request groups no longer surface title-cased planner subjects as the final request or PR title, align title-producing prompts with the lowercase-initial rule where needed, and add regression coverage for shared request-title formatting and planning metadata generation.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "stabilize lowercase request titles" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `fix(planning/request-title): stabilize lowercase request titles` and conventional-title metadata `fix(planning/request-title)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `fix(planning/request-title): stabilize lowercase request titles`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `request-title-case-a1-p1-stabilize-lowercase-request-titles`
