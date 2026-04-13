## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Move VS Code extension to `editors/vscode` with esbuild and backend-routed notifications" and confirm the canonical request/PR title is `feat: Move VS Code extension to `editors/vscode` with esbuild and backend-routed`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Relocate the existing extension package from `packages/vscode-extension` to `editors/vscode`, update workspace wiring and documentation to the new path, replace the current `tsc`/`dist` build with the requested esbuild `out/extension.js` pipeline, preserve VSIX packaging and local install scripts, and add a backend notification API plus client-side routing so when notification config is `vscode` the extension alone emits approval/failure alerts while the browser UI stays silent.
- [ ] 2.2 Run validation and capture reviewer findings for "Move VS Code extension to `editors/vscode` with esbuild and backend-routed notifications"
