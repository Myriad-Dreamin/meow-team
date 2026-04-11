# desktop-attention-a1-p1-notify-on-attention-needed-threads Specification

## Purpose

Define the desktop attention notification capability for the harness,
including opt-in browser notifications for living threads that newly enter
attention-needed states, reuse of existing thread polling data, and deduped
alerts for approvals and failures.

## Requirements

### Requirement: Notify on Attention-Needed Threads

The system SHALL implement the approved proposal recorded in OpenSpec change `desktop-attention-a1-p1-notify-on-attention-needed-threads`
and keep the work aligned with this proposal's objective: Add opt-in browser desktop notifications for living threads that newly transition into attention-needed states, starting with proposal approval waits and failures, using existing thread polling data and deduping repeated alerts.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Notify on Attention-Needed Threads" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
