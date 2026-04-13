# openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization Specification

## Purpose

Define the agent-backed OpenSpec proposal materialization capability for the
harness, including delegating proposal artifact generation to a dedicated
Codex/OpenSpec materializer, preserving the existing proposal dispatch and
approval flow, and covering artifact creation and failure handling.
## Requirements
### Requirement: Agent-backed OpenSpec proposal materialization
The system SHALL implement the approved proposal recorded in OpenSpec change `openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization`
and keep the work aligned with this proposal's objective: Replace hardcoded markdown generation in lib/team/openspec.ts with a dedicated Codex/OpenSpec artifact agent, preserve the current proposal dispatch and approval flow, and add regression coverage for artifact creation and failure handling.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Agent-backed OpenSpec proposal materialization" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat(oht/workflow): Agent-backed OpenSpec proposal materialization` and conventional-title metadata `feat(oht/workflow)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(oht/workflow): Agent-backed OpenSpec proposal materialization`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization`
