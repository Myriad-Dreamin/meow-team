## ADDED Requirements

### Requirement: Execute-mode requests persist normalized subtype metadata

The system SHALL detect planning inputs that begin with `execution:`,
`benchmark:`, or `experiment:`, normalize the prefix into explicit assignment
mode metadata, and strip that prefix from canonical request-title,
conventional-title, and proposal-branch inputs so execute mode remains
machine-readable without leaking into the canonical request subject.

#### Scenario: Prefixed request becomes an execute-mode assignment

- **WHEN** a planning request starts with `benchmark: compare worktree reuse latency`
- **THEN** the planner SHALL persist the assignment mode as `benchmark`
- **AND** the canonical request-title input SHALL be `compare worktree reuse latency`
- **AND** the generated proposal titles and branch-planning metadata SHALL omit
  the `benchmark:` prefix

#### Scenario: Persisted execute mode survives approval routing

- **WHEN** a human approves an `experiment` proposal and the lane later resumes
  for review or archive
- **THEN** the stored assignment mode SHALL remain `experiment`
- **AND** the resumed workflow SHALL route by that persisted mode instead of
  reparsing the raw request text

### Requirement: Approved execute-mode proposals use executor and execution-reviewer stages

The system SHALL route approved assignments with persisted execute-mode metadata
through `lib/team/executing/*` stages with `executor` and
`execution-reviewer` roles, while assignments without execute-mode metadata
SHALL remain on the existing coder and reviewer workflow. `lib/team/coding/index.ts`
SHALL remain the public run coordinator for both paths.

#### Scenario: Approved execute proposal enters the execute-review cycle

- **WHEN** a human approves an assignment whose stored mode is `execution`
- **THEN** the coordinator SHALL start the lane with the `executor` role
- **AND** the next machine review step SHALL use the `execution-reviewer` role
- **AND** the lane SHALL not enter the ordinary coder/reviewer cycle for that
  assignment

#### Scenario: Unprefixed proposal keeps the existing coding-review cycle

- **WHEN** a human approves an assignment whose stored mode is absent
- **THEN** the coordinator SHALL keep using the existing `coder` and `reviewer`
  roles
- **AND** the current unprefixed request behavior SHALL remain unchanged

### Requirement: Execute-mode prompts resolve subtype guides with AGENTS fallback

The system SHALL resolve execute-mode guidance from
`docs/guide/execution.md`, `docs/guide/benchmark.md`, or
`docs/guide/experiment.md` before starting execute-mode roles. If the
subtype-specific guide is absent, the system SHALL instruct the role to inspect
`AGENTS.md` for execution, benchmark, or experiment notes and SHALL expose that
fallback in the workflow context passed to the role.

#### Scenario: Repository guide exists for the execute subtype

- **WHEN** an approved execute-mode lane starts and `docs/guide/execution.md`
  exists in the repository
- **THEN** the execute-role prompt SHALL direct the agent to use that guide
- **AND** the prompt SHALL not require the `AGENTS.md` fallback for subtype
  guidance

#### Scenario: Repository guide is missing and fallback is required

- **WHEN** an approved benchmark lane starts in a repository without
  `docs/guide/benchmark.md`
- **THEN** the prompt SHALL tell the agent to inspect `AGENTS.md` for benchmark
  guidance
- **AND** the prompt context SHALL note that the subtype-specific guide was not
  found

### Requirement: Execution review validates scripts, validators, and summarized data

Execute-mode lanes SHALL produce reviewable artifacts that include committed
collection or benchmark scripts, committed validators or reproducible validation
commands, and a committed summary of collected data paths, formats, or key
results. The execution-reviewer SHALL evaluate both the script changes and the
validation or data summary contract before approving the lane, even when the raw
data itself is ignored by git.

#### Scenario: Raw data is gitignored but review remains possible

- **WHEN** an execute-mode lane generates raw output that is ignored by git
- **THEN** the lane SHALL still commit the script changes
- **AND** the lane SHALL commit a validator or reproducible validation command
- **AND** the lane SHALL commit a summary artifact that identifies the collected
  data path or reported results for review

#### Scenario: Missing validator blocks execution approval

- **WHEN** the execution-reviewer finds script or data changes without a usable
  validator or validation command
- **THEN** the reviewer SHALL set the decision to `needs_revision`
- **AND** the reviewer SHALL leave a concrete follow-up artifact such as a
  validator stub, failing validation fixture, or reviewer todo describing the
  missing verification work

### Requirement: Proposal execution stays isolated

The system SHALL keep execute-mode and ordinary proposal execution isolated to
the claimed implementation branch and reusable worktree until human feedback
explicitly requests request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the executor or coder starts work on an approved proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a
  reusable worktree from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat(team/executing): introduce execute mode workflow` and conventional-title
metadata `feat(team/executing)` through the materialized OpenSpec artifacts
without encoding slash-delimited roadmap or topic scope into `branchPrefix` or
OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `feat(team/executing): introduce execute mode workflow`
- **AND** the slash-delimited roadmap or topic scope SHALL remain metadata
  instead of changing the proposal change path
  `execute-mode-a1-p1-add-execute-mode-workflow-and-roles`
