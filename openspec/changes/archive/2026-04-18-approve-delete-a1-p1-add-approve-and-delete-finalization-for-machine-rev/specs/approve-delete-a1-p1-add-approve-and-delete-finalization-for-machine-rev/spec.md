## ADDED Requirements

### Requirement: Approve-and-delete finalization for machine-reviewed lanes

The system SHALL implement the approved proposal recorded in OpenSpec change
`approve-delete-a1-p1-add-approve-and-delete-finalization-for-machine-rev` and
keep the work aligned with this proposal's objective: extend machine-reviewed
final approval so users can choose `Approve and Delete` alongside
`Approve and Archive`, delete the active OpenSpec change on the lane branch,
commit and push that deletion, refresh the GitHub PR, persist retry-safe
finalization metadata, and cover the new UI, API, and state transitions with
regression tests.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Add approve-and-delete finalization for
  machine-reviewed lanes" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and
  machine-review workflow

### Requirement: Machine-reviewed approval exposes explicit finalization modes

The system SHALL expose explicit `archive` and `delete` finalization actions
for machine-reviewed lanes while preserving the existing proposal-approval path
for `awaiting_human_approval` lanes.

#### Scenario: Machine-reviewed lane shows both finalization actions

- **WHEN** a lane reaches Machine Reviewed and is ready for final human approval
- **THEN** the thread status and detail surfaces SHALL render both
  `Approve and Archive` and `Approve and Delete`
- **AND** the approval API and thread action entrypoint SHALL receive the
  selected finalization mode explicitly instead of inferring archive-only
  behavior

### Requirement: Delete-mode finalization updates the branch before PR refresh

The system SHALL remove the active
`openspec/changes/<change>` directory from the reviewed lane branch for delete
mode, create and push the deletion commit, and then reuse the existing GitHub
PR refresh or finalization flow for that branch.

#### Scenario: Approve and Delete succeeds

- **WHEN** the owner approves a machine-reviewed lane with finalization mode
  `delete`
- **THEN** the system SHALL delete that lane's active change directory from the
  branch workspace
- **AND** the system SHALL commit and push the deletion before refreshing the
  GitHub PR for the same lane branch

### Requirement: Finalization state remains retry-safe after partial success

The system SHALL persist finalization intent, artifact disposition, and
delivery progress explicitly in lane state and history so retries can resume
after archive or delete side effects already happened.

#### Scenario: Delete completes before PR refresh fails

- **WHEN** delete-mode finalization removes the active change and pushes the
  branch successfully but GitHub PR refresh fails afterward
- **THEN** the persisted lane state SHALL record that delete mode was selected
  and that proposal deletion already completed
- **AND** a retry SHALL resume PR delivery without attempting to delete or
  recommit the proposal a second time

### Requirement: Finalization guardrails reflect archived versus deleted state

The system SHALL reject incompatible finalization modes when the lane proposal
artifacts are already archived or already deleted, and SHALL expose those
outcomes in completed-lane copy and timeline history.

#### Scenario: Delete requested after proposal is already archived

- **WHEN** a delete-mode finalization or retry targets a lane whose proposal has
  already been archived
- **THEN** the system SHALL fail with mode-specific guidance instead of deleting
  the archived copy or silently treating the lane as successful

#### Scenario: Completed lane shows deleted outcome

- **WHEN** a machine-reviewed lane finishes through delete-mode finalization
- **THEN** completed status, planner notes, and timeline events SHALL describe
  the proposal as deleted rather than archived

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed
implementation branch and reusable worktree until human feedback explicitly
requests request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a
  reusable worktree from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: enable approve-and-delete finalization` and conventional-title metadata
`feat` through the materialized OpenSpec artifacts without encoding
slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change
paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat: enable approve-and-delete finalization`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `approve-delete-a1-p1-add-approve-and-delete-finalization-for-machine-rev`
