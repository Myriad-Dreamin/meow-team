## 1. Config loading contract

- [x] 1.1 Define normalized Meow Flow team config types and runtime validation in `packages/meow-flow-core`.
- [x] 1.2 Implement `team.config.ts` discovery plus `--config` override handling in `packages/meow-flow`.
- [x] 1.3 Implement module loading and error reporting for executable TypeScript config files, including a decision on runtime support for project-local path aliases.
- [x] 1.4 Add focused tests for missing-config, discovered-config, and invalid-config flows.

## 2. Repository and worktree planning

- [x] 2.1 Add pure planning helpers in `packages/meow-flow-core` that turn normalized config into ordered repository candidates and deterministic worktree allocation descriptors.
- [x] 2.2 Add the `meow-flow plan` command in `packages/meow-flow` with human-readable and `--json` output modes.
- [x] 2.3 Add targeted tests covering multi-root config, ordering guarantees, and stable JSON output for planning results.

## 3. Integration polish

- [x] 3.1 Update CLI help text and package-level documentation to describe `team.config.ts` discovery and `meow-flow plan`.
- [x] 3.2 Run package-level verification for the touched Meow Flow packages, including targeted tests and workspace typecheck.
