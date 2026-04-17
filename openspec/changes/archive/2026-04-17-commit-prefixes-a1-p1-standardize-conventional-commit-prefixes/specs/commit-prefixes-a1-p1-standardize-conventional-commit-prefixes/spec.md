## ADDED Requirements

### Requirement: Standardize Conventional Commit Prefixes

The system SHALL implement the approved proposal recorded in OpenSpec change
`commit-prefixes-a1-p1-standardize-conventional-commit-prefixes` and keep the
work aligned with this proposal's objective: introduce a shared harness
commit-message formatter, replace planner `planner:` and coder `coder:`
auto-commit subjects with deterministic `docs:` / `dev:` / `fix:` / `test:`
prefixes, align lane prompt guidance for direct agent-authored commits, and
add regression coverage for proposal materialization plus coding and archive
commit flows.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Standardize Conventional Commit Prefixes"
  proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and
  machine-review workflow

### Requirement: Harness-managed commit subjects use deterministic prefixes

The harness SHALL format repository-managed commit subjects as lowercase
conventional commits using only `docs`, `dev`, `fix`, and `test`, and SHALL
fall back to `dev` when the work intent is ambiguous.

#### Scenario: Ambiguous implementation work falls back to `dev:`

- **WHEN** the system prepares a harness-managed commit for internal
  implementation work that is not explicitly documentation-oriented,
  repair-oriented, or test-only
- **THEN** the generated subject SHALL start with `dev:`
- **AND** the system SHALL not emit `planner:` or `coder:`

### Requirement: Proposal and archive artifact commits use `docs:`

The system SHALL classify planner proposal materialization plus proposal,
archive, and documentation-oriented harness commits as `docs:` work.

#### Scenario: Planner materializes OpenSpec artifacts

- **WHEN** planner creates or updates proposal, design, tasks, or change-local
  spec artifacts for an approved proposal
- **THEN** the generated commit subject SHALL start with `docs:`

#### Scenario: Archive flow updates proposal artifacts

- **WHEN** coder or reviewer automation creates a commit whose primary purpose
  is to archive or update proposal and spec artifacts
- **THEN** the generated commit subject SHALL start with `docs:`

### Requirement: Repair and explicit test-only runs use `fix:` and `test:`

The system SHALL map repair-oriented work to `fix:` and SHALL reserve `test:`
for explicit test-only work rather than ordinary implementation that happens to
touch tests.

#### Scenario: Repair-oriented run prepares a commit

- **WHEN** a coder or reviewer flow is executing requested repair work
- **THEN** the generated commit subject SHALL start with `fix:`

#### Scenario: Explicit test-only run prepares a commit

- **WHEN** a coder or reviewer flow is explicitly limited to test-only changes
- **THEN** the generated commit subject SHALL start with `test:`
- **AND** adding or updating tests alongside normal implementation SHALL not by
  itself force the `test:` prefix

### Requirement: Direct agent-authored commit guidance matches automation

The coder and reviewer lane prompts SHALL instruct agents to use the same
lowercase conventional commit-prefix policy for any direct `git commit`
commands they author.

#### Scenario: Prompted manual commit follows shared guidance

- **WHEN** a lane prompt or generated shell command includes `git commit`
- **THEN** the subject SHALL use one of `docs:`, `dev:`, `fix:`, or `test:`
  according to the shared mapping rules

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
`dev(harness/commits): standardize harness commit prefixes` and
conventional-title metadata `dev(harness/commits)` through the materialized
OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into
`branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title
  `dev(harness/commits): standardize harness commit prefixes`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `commit-prefixes-a1-p1-standardize-conventional-commit-prefixes`
