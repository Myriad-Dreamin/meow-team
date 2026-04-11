## ADDED Requirements

### Requirement: Support Mutable Request Titles with LLM Fallback

The system SHALL implement the approved proposal recorded in OpenSpec change `request-title-a1-p1-support-mutable-request-titles-with-llm-fallback`
and keep the work aligned with this proposal's objective: Implement an end-to-end request title field for the harness: accept an optional human title, generate a concise fallback title through the existing LLM execution path when absent, persist it as mutable request-group metadata separate from all canonical IDs, and display it in the active thread UI without removing the underlying request text.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Support Mutable Request Titles with LLM Fallback" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
