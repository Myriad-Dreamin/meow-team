# vitepress-api-docs-a1-p1-set-up-vitepress-api-docs Specification

## Purpose

Define the VitePress API documentation capability for the harness,
including a `docs/`-rooted site, initial API landing and endpoint reference
pages for the existing `app/api/team` routes, and route headers that link
implementation files to their corresponding docs.

## Requirements

### Requirement: Set up VitePress API docs

The system SHALL implement the approved proposal recorded in OpenSpec change `vitepress-api-docs-a1-p1-set-up-vitepress-api-docs`
and keep the work aligned with this proposal's objective: Add a VitePress site rooted at `docs/`, create the initial API landing and endpoint reference pages for the existing `app/api/team` routes, and annotate each route file with a header that points to its corresponding documentation page.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Set up VitePress API docs" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
