## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Implement the VS Code workspace extension and local install flow" and confirm the canonical request/PR title is `feat(vscode-extension/ui): Implement the VS Code workspace extension and local`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat(vscode-extension/ui)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Continue `vscode-extension-ui-a1-p1-build-nextjs-backed-workspace-ui` by reconciling the package boundary in favor of the requested `packages/vscode-extension` location, scaffolding a VS Code webview extension using `/home/kamiyoru/work/rust/tinymist/editors/vscode` as the reference shape, wiring the first workspace read and mutation flows to the existing Next.js `/api/team/*` endpoints through a configurable HTTP bridge, and adding a root `vscode:install` script that packages and installs the built VSIX into local VS Code via `code`.
- [x] 2.2 Run validation and capture reviewer findings for "Implement the VS Code workspace extension and local install flow"
