# vscode-ui-a1-p1-implement-the-vs-code-workspace-extension-and-local-inst Specification

## Purpose

Define the approved VS Code workspace-extension delivery so the repository
ships the editor surface from `editors/vscode`, bridges it to the
existing Next.js `/api/team/*` backend, and supports local VSIX packaging and
installation.

## Requirements

### Requirement: Implement the VS Code workspace extension and local install flow

The system SHALL implement the approved proposal recorded in OpenSpec change `vscode-ui-a1-p1-implement-the-vs-code-workspace-extension-and-local-inst`
and keep the work aligned with this proposal's objective: Continue `vscode-extension-ui-a1-p1-build-nextjs-backed-workspace-ui` by shipping the VS Code extension from `editors/vscode`, scaffolding a VS Code webview extension using `/home/kamiyoru/work/rust/tinymist/editors/vscode` as the reference shape, wiring the first workspace read and mutation flows to the existing Next.js `/api/team/*` endpoints through a configurable HTTP bridge, and adding a root `vscode:install` script that packages and installs the built VSIX into local VS Code via `code`.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Implement the VS Code workspace extension and local install flow" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `feat(vscode-extension/ui): Implement the VS Code workspace extension and local` and conventional-title metadata `feat(vscode-extension/ui)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(vscode-extension/ui): Implement the VS Code workspace extension and local`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `vscode-ui-a1-p1-implement-the-vs-code-workspace-extension-and-local-inst`
