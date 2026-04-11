## ADDED Requirements

### Requirement: Add Roadmap Concept and Archive Linking
The system SHALL implement the approved proposal recorded in OpenSpec change `roadmap-concept-a1-p1-add-roadmap-concept-and-archive-linking`
and keep the work aligned with this proposal's objective: Introduce the `docs/roadmap` structure, a repo-local roadmap skill with alias-aware guidance, docs navigation updates, and deterministic final-archive updates that append archived OpenSpec spec links into the matching roadmap topic's `## Related Specs` section.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Add Roadmap Concept and Archive Linking" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat(roadmap): Add Roadmap Concept and Archive Linking` and conventional-title metadata `feat(roadmap)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(roadmap): Add Roadmap Concept and Archive Linking`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `roadmap-concept-a1-p1-add-roadmap-concept-and-archive-linking`
