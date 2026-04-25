## Why

`meow-flow` is still a bootstrap CLI, so it has no project-specific input for repository discovery or worktree planning. The intended team config already describes repository roots, worker limits, and runtime helpers; until the CLI can load that config, downstream repository selection and worktree allocation cannot be implemented in a stable way.

## What Changes

- Add `team.config.ts` loading to `meow-flow`, with an explicit `--config` override and default discovery from the current working directory.
- Introduce validated Meow Flow team config primitives in `meow-flow-core` for dispatch settings, notifications, and repository roots.
- Add planning logic that turns the loaded config into an ordered repository candidate set and deterministic worktree allocation descriptors.
- Add an inspectable CLI surface for dry-run planning so users can verify resolved config, selected repositories, and worktree allocation before execution features exist.
- Add focused tests for config discovery, module loading, validation failures, and planning output.

## Capabilities

### New Capabilities

- `team-config-driven-dispatch`: Load team config and derive repository and worktree planning decisions for `meow-flow` commands.

### Modified Capabilities

None.

## Impact

- `packages/meow-flow` command definitions, config discovery, module loading, and user-facing output
- `packages/meow-flow-core` config schema, normalized planning types, and pure repository/worktree planning helpers
- New targeted tests for CLI config loading and deterministic planning output
- Possible runtime dependency changes if TypeScript config loading needs more than the current bootstrap setup
