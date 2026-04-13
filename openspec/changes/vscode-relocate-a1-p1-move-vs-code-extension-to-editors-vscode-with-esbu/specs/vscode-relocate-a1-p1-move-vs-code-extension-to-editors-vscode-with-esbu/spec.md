## ADDED Requirements

### Requirement: Move VS Code extension to `editors/vscode` with esbuild and backend-routed notifications
The system SHALL implement the approved proposal recorded in OpenSpec change `vscode-relocate-a1-p1-move-vs-code-extension-to-editors-vscode-with-esbu`
and keep the work aligned with this proposal's objective: Relocate the existing extension package from `packages/vscode-extension` to `editors/vscode`, update workspace wiring and documentation to the new path, replace the current `tsc`/`dist` build with the requested esbuild `out/extension.js` pipeline, preserve VSIX packaging and local install scripts, and add a backend notification API plus client-side routing so when notification config is `vscode` the extension alone emits approval/failure alerts while the browser UI stays silent.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Move VS Code extension to `editors/vscode` with esbuild and backend-routed notifications" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat: Move VS Code extension to `editors/vscode` with esbuild and backend-routed` and conventional-title metadata `feat`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat: Move VS Code extension to `editors/vscode` with esbuild and backend-routed`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `vscode-relocate-a1-p1-move-vs-code-extension-to-editors-vscode-with-esbu`
