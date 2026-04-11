## ADDED Requirements

### Requirement: Refine Side UI Controls
The system SHALL implement the approved proposal recorded in OpenSpec change `side-ui-controls-a1-p1-refine-side-ui-controls`
and keep the work aligned with this proposal's objective: Create a single implementation proposal that updates the workspace shell navigation and status bar: move `Run Team` to an icon-only `+` beside `Living Threads`, add a `Settings` tab opened from a gear icon in the status bar, relocate desktop alerts controls into that tab, remove redundant editor/status labels, and keep existing thread/status behavior intact.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Refine Side UI Controls" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
