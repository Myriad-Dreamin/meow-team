# worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure Specification

## Purpose

Define the managed worktree PR-delivery capability so proposal approval opens
or refreshes a draft tracking PR, reviewer completion rebases and readies that
same PR against `main`, and git or `gh` subprocesses ignore broken
worktree-local wrappers such as the stale `.git-local` shim.

## Requirements

### Requirement: Fix managed-worktree `.git-local` PR failure

The system SHALL implement the approved proposal recorded in OpenSpec change `worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure`
and keep the work aligned with this proposal's objective: Implement one OpenSpec-aligned change that opens or refreshes a GitHub draft PR immediately after proposal approval, preserves that same PR through coder/reviewer/final-archive flow, rebases onto `main` and requeues the coding-review cycle on conflicts before marking the PR ready after machine review, and fixes managed-worktree git/gh subprocess resolution so the stale `node_modules/.bin/git` -> `.git-local` wrapper can no longer break proposal-time or final PR operations.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Fix managed-worktree `.git-local` PR failure" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `fix(team/worktree): Fix managed-worktree `.git-local` PR failure` and conventional-title metadata `fix(team/worktree)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `fix(team/worktree): Fix managed-worktree `.git-local` PR failure`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure`
