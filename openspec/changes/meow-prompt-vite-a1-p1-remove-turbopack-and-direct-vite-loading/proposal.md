## Why

Delete the Turbopack-specific `meow-prompt` integration, replace `walkDirectory`-based declaration syncing with Vite-managed loading for `app` and optional `docs`, and update tests/config so supported prompt imports remain typed under the new flow. One proposal: remove Turbopack from `meow-prompt` and replace repo-wide declaration walking with Vite-managed loading for `app` plus optional `docs`. This proposal is one candidate implementation for the request: Improve `meow-prompt`: - remove turbopack support. - avoid `walkDirectory` but configure vite to directly load files in `app` and `docs` and transform them using `meow-prompt`. Note astro doesn't walk directory (see https://github.com/withastro/astro/blob/7fe40bc7381d981dedad16625d89c00e31cd8fd0/packages/astro/src/vite-plugin-astro/index.ts).

## What Changes

- Introduce the `meow-prompt-vite-a1-p1-remove-turbopack-and-direct-vite-loading` OpenSpec change for proposal "Remove Turbopack and Direct Vite Loading".
- Delete the Turbopack-specific `meow-prompt` integration, replace `walkDirectory`-based declaration syncing with Vite-managed loading for `app` and optional `docs`, and update tests/config so supported prompt imports remain typed under the new flow.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `meow-prompt-vite-a1-p1-remove-turbopack-and-direct-vite-loading`: Delete the Turbopack-specific `meow-prompt` integration, replace `walkDirectory`-based declaration syncing with Vite-managed loading for `app` and optional `docs`, and update tests/config so supported prompt imports remain typed under the new flow.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Remove Turbopack and Direct Vite Loading` Execution intent - Remove the Turbopack-specific loader and Next config path. - Replace `walkDirectory`-based declaration syncing with a Vite-managed bootstrap/load flow limited to `app/**` and `docs/**` so prompt/template files are transformed by `meow-prompt` directly. - Rework tests and typing checks to validate the new supported flow. Implementation notes for the coder - Focus first on `next.config.ts`, `package.json`, `packages/meow-prompt/src/declaration-sync.ts`, and `packages/meow-prompt/src/vite-plugin.ts`. - Preserve `meow-prompt`'s typed import guarantees for the supported roots, but do not preserve arbitrary repo-wide scanning. - A virtual entry/import strategy or another Vite-managed loading mechanism is acceptable, but reintroducing custom recursive walking is out of scope. - Update or replace the current typecheck regression that depends on `syncMeowPromptDeclarationsForNext()` so it exercises the approved Vite path instead. Risks to resolve during implementation - Validate how the Next app continues to execute `app/*.prompt.md` imports after Turbopack support is removed. - Ensure missing `docs/` does not fail either declaration generation or tests. - Make Vite dependency ownership explicit if repo code imports Vite directly. Approval gate - Do not schedule coder/reviewer work until the owner approves this proposal.
