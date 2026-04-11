## ADDED Requirements

### Requirement: Complete Machine-Reviewed Approval, Archive, and GitHub PR Flow
The system SHALL implement the approved proposal recorded in OpenSpec change `machine-review-pr-a1-p1-complete-machine-reviewed-approval-archive-and-g`
and keep the work aligned with this proposal's objective: Separate machine-reviewed approval from proposal approval, show the approve action in Machine Reviewed state, archive the approved lane's OpenSpec proposal on-branch, and create or refresh a GitHub PR from that branch into main after human approval.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Complete Machine-Reviewed Approval, Archive, and GitHub PR Flow" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
