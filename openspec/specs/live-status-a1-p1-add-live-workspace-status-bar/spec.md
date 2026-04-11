# live-status-a1-p1-add-live-workspace-status-bar Specification

## Purpose
Define the live workspace status bar capability for the harness, including a
lightweight status snapshot API and a 1-second polling UI that surfaces active
thread totals, lane-state counts, and host CPU and memory usage without
affecting dispatch scheduling.
## Requirements
### Requirement: Add live workspace status bar
The system SHALL implement the approved proposal recorded in OpenSpec change `live-status-a1-p1-add-live-workspace-status-bar`
and keep the work aligned with this proposal's objective: Implement a lightweight status snapshot API and a 1-second polling workspace status bar that shows active thread totals plus aggregated lane states on the left and host CPU-memory usage on the right, without affecting dispatch scheduling.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Add live workspace status bar" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
