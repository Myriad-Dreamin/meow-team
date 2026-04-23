## Why

`meow-flow` currently depends on a repo-local `team.config.ts`, which keeps config resolution tied to the current working directory and worktree layout. A shared installed config at `~/.local/shared/meow-flow/config.js` gives every lane the same resolved source of truth, while still letting teams author the config in either JavaScript or TypeScript.

## What Changes

- Add `meow-flow config install <path>` to install a `.js` or `.ts` config module into the canonical shared location `~/.local/shared/meow-flow/config.js`.
- Make the installed artifact plain JavaScript so TypeScript-authored configs do not require TypeScript support at the shared destination.
- Canonicalize installed config output so later `meow-flow` commands can load it from the shared location without depending on the original repo-relative module path layout.
- Update config resolution so `--config <path>` still wins, shared installed config is preferred by default, and legacy local discovery remains as a compatibility fallback when no shared install exists.
- Add focused tests and documentation for shared config installation, supported file types, and loading precedence.

## Capabilities

### New Capabilities
- `shared-team-config`: Install and consume a shared Meow Flow config artifact from `~/.local/shared/meow-flow/config.js`.

### Modified Capabilities

None.

## Impact

- `packages/meow-flow` CLI command tree, config loading flow, and config install output
- `packages/meow-flow-core` normalization helpers reused to make installed config portable across locations
- `packages/meow-flow` tests and README for install behavior, source-type support, and shared-config precedence
