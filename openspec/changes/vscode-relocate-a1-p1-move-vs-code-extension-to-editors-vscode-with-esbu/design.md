## Context

This change captures proposal "Move VS Code extension to `editors/vscode` with esbuild and backend-routed notifications" as OpenSpec change `vscode-relocate-a1-p1-move-vs-code-extension-to-editors-vscode-with-esbu`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Relocate the existing extension package from `packages/vscode-extension` to `editors/vscode`, update workspace wiring and documentation to the new path, replace the current `tsc`/`dist` build with the requested esbuild `out/extension.js` pipeline, preserve VSIX packaging and local install scripts, and add a backend notification API plus client-side routing so when notification config is `vscode` the extension alone emits approval/failure alerts while the browser UI stays silent.
- Preserve a reviewable OpenSpec contract before coding starts.
- Keep the proposal logical enough that any pooled worker can execute it.
- Reuse a managed worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` for cache-friendly execution.

**Non-Goals:**
- Bind this proposal to a specific branch or worker slot before approval.
- Expand scope beyond the approved proposal without human feedback.
- Merge sibling proposals into a single coding pass without replanning.

## Decisions

- Store the proposal as a dedicated OpenSpec change before coding begins.
- Let the pooled coding-review runtime allocate execution branches and worktrees after approval.
- Use planner output as the starting point for reviewer validation and follow-up tasks.
- Prefer incremental implementation that can be requeued after machine review feedback.
- Keep the canonical request/PR title as `feat: Move VS Code extension to `editors/vscode` with esbuild and backend-routed`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat: Move VS Code extension to `editors/vscode` with esbuild and backend-routed`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal 1: `Move VS Code Extension to editors/vscode with backend-routed notifications`. Suggested OpenSpec seed: `vscode-relocate-a1-p1-move-extension-build-and-notify`. Objective: relocate the current extension package from `packages/vscode-extension` to `editors/vscode`; update `pnpm-workspace.yaml`, root `package.json` scripts, README/roadmap/OpenSpec references, and any tests or path assumptions that still point at the old package; replace the `tsc`-based `dist` build with the requested esbuild bundle flow that writes `out/extension.js` and an `out/extension.web.js` placeholder; keep VSIX packaging and `vscode:install` intact after the move; extract or share the existing approval/failure attention-notification classification so the backend can publish a dedicated `/api/team/notifications` contract; and teach both the web UI and VS Code extension to honor a notification target config where `vscode` means only the extension emits user-visible approval/failure notifications. Scope boundaries: do not move harness orchestration into the extension host, and do not expand notifications beyond the current attention-needed approval/failure states unless required to preserve parity. Main risk: the repository does not yet have a canonical persisted setting for notification routing, so implementation should choose one backend-owned contract and update docs/specs so the repository no longer mixes `packages/vscode-extension` and `editors/vscode` assumptions. Coding/review lanes stay idle until approval.
