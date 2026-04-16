# approval-refs-a1-p1-harden-approval-branch-ref-resolution Specification

## Purpose

Define the approval-stage request-branch resolution capability so slash-delimited
request refs resolve through explicit local refs during proposal approval,
machine-review checkpoints, and final archive or PR refresh paths while
remaining compatible with existing persisted branch identifiers.

## Requirements

### Requirement: Resolve approval-stage request branches through explicit local refs

The system SHALL resolve local request branch heads through explicit ref-safe
lookups anywhere proposal approval, machine-review checkpoints, or final
archive approval need the current branch head for a request lane.

#### Scenario: Proposal approval uses a nested request branch namespace

- **WHEN** a human approves the "Harden approval branch ref resolution"
  proposal for branch
  `requests/workflow-pages/0784c123-bcb3-4eaf-acc3--62086a172c62c97d/a1-proposal-1`
- **THEN** the approval flow SHALL resolve the branch head from the matching
  local branch ref
- **AND** the workflow SHALL continue to push the branch and refresh tracking
  PR state without an ambiguous revision failure

#### Scenario: Final approval refreshes an archived nested request branch

- **WHEN** final approval archives an OpenSpec change on a slash-delimited
  request branch
- **THEN** the archive and PR-refresh path SHALL resolve the latest branch head
  through the same ref-safe lookup
- **AND** final approval SHALL not fail because the branch name is parsed as an
  ambiguous revision

### Requirement: Preserve compatibility with persisted branch identifiers

The system SHALL continue to resolve branch heads for existing persisted lane
records without requiring a branch rename or storage migration before approval
can continue.

#### Scenario: Approval flow receives a legacy persisted branch identifier

- **WHEN** proposal approval or final approval reads a stored branch identifier
  that is already fully qualified or uses an older persisted namespace shape
- **THEN** the shared branch-head helper SHALL resolve the same local commit
- **AND** the workflow SHALL continue without rewriting the stored branch name

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a
  reusable worktree from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`fix(workflow-pages/approval): harden approval branch resolution` and
conventional-title metadata `fix(workflow-pages/approval)` through the
materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic
scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `fix(workflow-pages/approval): harden approval branch resolution`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `approval-refs-a1-p1-harden-approval-branch-ref-resolution`
