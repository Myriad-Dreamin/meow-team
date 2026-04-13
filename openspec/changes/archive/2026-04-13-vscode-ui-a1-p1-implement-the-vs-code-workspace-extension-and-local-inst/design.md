## Context

This change captures proposal "Implement the VS Code workspace extension and local install flow" as OpenSpec change `vscode-ui-a1-p1-implement-the-vs-code-workspace-extension-and-local-inst`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Continue `vscode-extension-ui-a1-p1-build-nextjs-backed-workspace-ui` by reconciling the package boundary in favor of the requested `packages/vscode-extension` location, scaffolding a VS Code webview extension using `/home/kamiyoru/work/rust/tinymist/editors/vscode` as the reference shape, wiring the first workspace read and mutation flows to the existing Next.js `/api/team/*` endpoints through a configurable HTTP bridge, and adding a root `vscode:install` script that packages and installs the built VSIX into local VS Code via `code`.
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
- Keep the canonical request/PR title as `feat(vscode-extension/ui): Implement the VS Code workspace extension and local`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat(vscode-extension/ui)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat(vscode-extension/ui): Implement the VS Code workspace extension and local`
- Conventional title metadata: `feat(vscode-extension/ui)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: The existing OpenSpec change `vscode-extension-ui-a1-p1-build-nextjs-backed-workspace-ui` is already apply-ready, so the practical plan is a single implementation proposal rather than separate scaffold and integration tracks. The package boundary, extension manifest/build setup, Next.js HTTP bridge, and local install flow are tightly coupled; splitting them would create blocking dependencies and approval noise. Recommended scope: - Treat the latest request as authoritative on package location. The current OpenSpec and roadmap text says `editors/vscode`, but the new request explicitly asks for install flow from `packages/vscode-extension`, and that also matches the current `pnpm-workspace.yaml` glob. Implementation should reconcile the docs/spec text to one package boundary instead of carrying both. - Use `/home/kamiyoru/work/rust/tinymist/editors/vscode` as a structural reference for extension manifest, activation, views, and packaging conventions, but not as a required path layout. - Scaffold the VS Code extension package, manifest, build/package scripts, and workspace wiring; add a root `vscode:install` script that packages the extension and installs the built VSIX into local VS Code with `code --install-extension`. - Ship one primary webview workspace surface backed by the existing Next.js backend. The first milestone should cover the editor-critical flows already exposed by the web app: start or reset a request via `/api/team/run`, poll living threads via `/api/team/threads`, inspect thread detail via `/api/team/threads/:threadId`, approve proposals or PRs via `/api/team/approval`, and submit replanning feedback via `/api/team/feedback`. Add `/api/team/logs` only as needed to make the thread view usable. - Keep the extension thin. Backend orchestration, persistence, and long-running workflow logic stay in Next.js; the extension should use a configurable base URL plus explicit GET/POST calls, with visible connection-state and recovery guidance. - Prefer shared request/response types or lightweight client helpers over importing backend runtime modules into the extension. - Validation should include extension activation or smoke coverage, backend-bridge error handling, packaging verification, and repo-standard `pnpm fmt`, `pnpm lint`, and `pnpm build` when the integration is in place. Scope boundaries: - Do not reimplement harness orchestration inside the extension host. - Do not aim for full browser parity in the first pass; desktop notifications, archived-thread polish, and auxiliary windows can stay out unless they fall out cheaply. - Do not expand into remote-auth hardening beyond the current trusted/local backend model for this milestone. Assumptions and risks: - This plan assumes the latest request wins on `packages/vscode-extension`; implementation should update the existing OpenSpec artifacts and roadmap docs so the repository has one consistent package boundary. - `vscode:install` depends on the `code` CLI being available on PATH, so the script should fail clearly or document that prerequisite. - The first extension pass should stay on the existing `/api/team/*` contract; any missing endpoint data should be addressed incrementally rather than by embedding server logic in the extension. Coding-review pool guidance: - Keep coder and reviewer lanes idle until the owner approves this single proposal.
