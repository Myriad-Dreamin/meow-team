# meow-prompt-build-a1-p1-simplify-meow-prompt-build-pipeline-and-yaml-fro Specification

## Purpose

Define the simplified `meow-prompt` build capability for the harness,
including Vite lifecycle generated declaration files, YAML frontmatter
parsing via `stripYamlFrontmatter` and `js-yaml`, removal of webpack-only and
template-sync paths, and preserved typed prompt imports across Next, Vitest,
and TypeScript.

## Requirements

### Requirement: Simplify meow-prompt build pipeline and YAML frontmatter

The system SHALL implement the approved proposal recorded in OpenSpec change `meow-prompt-build-a1-p1-simplify-meow-prompt-build-pipeline-and-yaml-fro`
and keep the work aligned with this proposal's objective: Remove webpack-only support and the standalone template-sync CLI, generate prompt declaration files from the Vite lifecycle, replace custom frontmatter parsing with `stripYamlFrontmatter` plus `js-yaml`, and update configs/tests so typed prompt imports still work across Next, Vitest, and TypeScript.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Simplify meow-prompt build pipeline and YAML frontmatter" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
