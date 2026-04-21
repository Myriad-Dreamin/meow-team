## ADDED Requirements

### Requirement: Approved proposal enters execution

The system SHALL implement the approved proposal recorded in OpenSpec change
`stage-commit-push-a1-p1-publish-stage-generated-lane-commits` and keep the
work aligned with this proposal's objective: extend the lane runtime so coder
and reviewer stages publish any new branch head they create, persist accurate
pushed-commit state through requeues and approvals, and add regression coverage
for stage-end publish success and failure paths.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Publish stage-generated lane commits" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and
  machine-review workflow

### Requirement: Stage-generated implementation heads publish before review

The system SHALL publish any new lane branch head created by coder or executor
work before reviewer or execution-reviewer validation begins, and SHALL reuse
the recorded pushed-head metadata to skip redundant publication when the
current head is already remote-backed.

#### Scenario: Coder finishes with a new unpublished commit

- **WHEN** coder or executor work advances the lane branch head beyond the
  recorded `pushedCommit`
- **THEN** the system SHALL publish that new head before transitioning the lane
  into reviewer or execution-reviewer work
- **AND** SHALL persist matching `latestImplementationCommit` and `pushedCommit`
  metadata for the published head

#### Scenario: Stage-end publish fails after implementation

- **WHEN** coder or executor work produces a new branch head and the stage-end
  publish fails
- **THEN** the system SHALL stop the lane with a blocking error
- **AND** SHALL NOT start reviewer or execution-reviewer work against a
  local-only branch head

### Requirement: Reviewer feedback commits publish before requeue

The system SHALL detect reviewer or execution-reviewer branch changes produced
during a `needs_revision` outcome, commit dirty worktree artifacts when
necessary, and publish the resulting feedback head before requeueing the next
implementation pass.

#### Scenario: Reviewer leaves feedback through committed or dirty artifacts

- **WHEN** reviewer or execution-reviewer work returns `needs_revision` after
  creating a direct branch commit or dirty worktree artifacts
- **THEN** the system SHALL create any missing feedback commit, publish the
  resulting head, and record it as the lane's latest implementation commit
  before requeueing the next coder or executor pass
- **AND** SHALL preserve the reviewer-authored follow-up artifacts and handoff
  summary for the next implementation cycle

#### Scenario: Reviewer feedback publish fails

- **WHEN** reviewer or execution-reviewer work produces a new feedback commit
  but the publish step fails
- **THEN** the system SHALL fail the lane instead of silently requeueing it
- **AND** SHALL surface the publish failure in lane activity or planner notes
  without discarding the reviewer-authored artifacts

### Requirement: Published-head metadata stays truthful across retries and approvals

The system SHALL keep `latestImplementationCommit` and `pushedCommit`
consistent with the branch publication lifecycle so requeues, PR refresh
failures, and approval-time no-op publishes accurately reflect whether the
current lane head is already published.

#### Scenario: Downstream delivery fails after publish succeeds

- **WHEN** a stage-end or approval-time branch publish succeeds but a later PR
  refresh or approval step fails
- **THEN** the lane state SHALL retain the successful `pushedCommit` metadata
  for the published head
- **AND** SHALL reuse that metadata on retry until a newer local head is
  created or a newer publish succeeds

#### Scenario: Approval path sees an already published head

- **WHEN** reviewer or execution-reviewer approval reaches the publication step
  and the current lane head already matches the recorded `pushedCommit`
- **THEN** the system SHALL skip the redundant push
- **AND** SHALL continue the existing rebase or PR-ready flow without clearing
  or rewriting the published-head metadata

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
`feat(lanes/runtime): Publish stage-generated lane commits` and
conventional-title metadata `feat(lanes/runtime)` through the materialized
OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into
`branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `feat(lanes/runtime): Publish stage-generated lane commits`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `stage-commit-push-a1-p1-publish-stage-generated-lane-commits`
