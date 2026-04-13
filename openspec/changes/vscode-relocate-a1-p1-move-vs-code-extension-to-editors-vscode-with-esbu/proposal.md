## Why

Relocate the existing extension package from `packages/vscode-extension` to `editors/vscode`, update workspace wiring and documentation to the new path, replace the current `tsc`/`dist` build with the requested esbuild `out/extension.js` pipeline, preserve VSIX packaging and local install scripts, and add a backend notification API plus client-side routing so when notification config is `vscode` the extension alone emits approval/failure alerts while the browser UI stays silent. One coupled proposal: move the VS Code extension to `editors/vscode`, switch it to esbuild output, and centralize attention notifications behind a backend API with explicit `vscode` routing. This proposal is one candidate implementation for the request: Move vscode extension to `editors/vscode`, and use esbuild to build the extension. - adds notification api, which forwards system notification from the backend to vscode. when config is configured to `vscode`, only vscode emits system notification to the user. ```js import { build } from "esbuild"; import * as fs from "fs"; if (!fs.existsSync("./out/extension.web.js")) { fs.mkdirSync("./out", { recursive: true }); fs.writeFileSync("./out/extension.web.js", ""); } build({ entryPoints: ["./src/extension.ts"], bundle: true, outfile: "./out/extension.js", external: ["vscode"], format: "cjs", platform: "node", }).catch(() => process.exit(1)); ```.

## What Changes

- Introduce the `vscode-relocate-a1-p1-move-vs-code-extension-to-editors-vscode-with-esbu` OpenSpec change for proposal "Move VS Code extension to `editors/vscode` with esbuild and backend-routed notifications".
- Relocate the existing extension package from `packages/vscode-extension` to `editors/vscode`, update workspace wiring and documentation to the new path, replace the current `tsc`/`dist` build with the requested esbuild `out/extension.js` pipeline, preserve VSIX packaging and local install scripts, and add a backend notification API plus client-side routing so when notification config is `vscode` the extension alone emits approval/failure alerts while the browser UI stays silent.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `vscode-relocate-a1-p1-move-vs-code-extension-to-editors-vscode-with-esbu`: Relocate the existing extension package from `packages/vscode-extension` to `editors/vscode`, update workspace wiring and documentation to the new path, replace the current `tsc`/`dist` build with the requested esbuild `out/extension.js` pipeline, preserve VSIX packaging and local install scripts, and add a backend notification API plus client-side routing so when notification config is `vscode` the extension alone emits approval/failure alerts while the browser UI stays silent.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat: Move VS Code extension to `editors/vscode` with esbuild and backend-routed`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal 1: `Move VS Code Extension to editors/vscode with backend-routed notifications`. Suggested OpenSpec seed: `vscode-relocate-a1-p1-move-extension-build-and-notify`. Objective: relocate the current extension package from `packages/vscode-extension` to `editors/vscode`; update `pnpm-workspace.yaml`, root `package.json` scripts, README/roadmap/OpenSpec references, and any tests or path assumptions that still point at the old package; replace the `tsc`-based `dist` build with the requested esbuild bundle flow that writes `out/extension.js` and an `out/extension.web.js` placeholder; keep VSIX packaging and `vscode:install` intact after the move; extract or share the existing approval/failure attention-notification classification so the backend can publish a dedicated `/api/team/notifications` contract; and teach both the web UI and VS Code extension to honor a notification target config where `vscode` means only the extension emits user-visible approval/failure notifications. Scope boundaries: do not move harness orchestration into the extension host, and do not expand notifications beyond the current attention-needed approval/failure states unless required to preserve parity. Main risk: the repository does not yet have a canonical persisted setting for notification routing, so implementation should choose one backend-owned contract and update docs/specs so the repository no longer mixes `packages/vscode-extension` and `editors/vscode` assumptions. Coding/review lanes stay idle until approval.
