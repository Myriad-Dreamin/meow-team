## Context

`packages/meow-flow` currently exposes only a Commander root with `--help` and `--version`, while `packages/meow-flow-core` is still a placeholder package. The requested config is an executable TypeScript module, not static data: it imports Node built-ins and local helpers such as `defineTeamConfig`, `readTeamRuntimeConfig`, and `@/...` aliases. The harness docs also point to `team.config.ts` as the project-level source of dispatch settings, so the first usable Meow Flow slice should load that file, validate it, and expose a dry-run planning result before any worker execution exists.

## Goals / Non-Goals

**Goals:**

- Resolve `team.config.ts` from the current working directory, with an explicit `--config` override for non-default locations.
- Validate the loaded config into stable internal types before any repository or worktree planning occurs.
- Compute an ordered repository candidate list and deterministic worktree allocation descriptors from the normalized config.
- Expose a user-visible `meow-flow plan` command with human-readable and JSON output so the feature is testable before execution commands are added.

**Non-Goals:**

- Creating git worktrees, spawning workers, or dispatching proposals in this change
- Implementing semantic repository matching from natural-language task text
- Supporting every possible config style on day one; `team.config.ts` is the primary target
- Adding config file watching, hot reload, or long-lived daemon behavior

## Decisions

### 1. Split runtime responsibilities between CLI and core

`meow-flow-core` should own the config schema, normalized domain types, and pure planning helpers. `meow-flow` should own Commander commands, config discovery, module loading, and output formatting.

This keeps planning logic isolated from process-level concerns and gives the placeholder core package a clear responsibility. Keeping everything in `packages/meow-flow` would be faster short term, but it would make the later dispatch engine harder to test independently.

### 2. Load the config as executable module input

The provided config is TypeScript and imports project-local code, so `meow-flow` should load it as a module rather than require JSON or YAML. The CLI should prefer `--config <path>` when provided, and otherwise search upward from `process.cwd()` for `team.config.ts`.

Requiring JSON would make the shown config impossible to use. Pure `import()` against built JavaScript is also insufficient because the user-authored config lives in source form and may depend on the owning project's TypeScript resolution rules.

### 3. Normalize and validate before planning

The loader should hand raw module output to a strict schema in `meow-flow-core`, producing a normalized team config with absolute repository directories, stable ids, and narrow planning types. Validation failures should name the config file and field path so the CLI fails early and clearly.

Passing raw config objects deeper into planning would spread validation logic across commands and make later execution behavior fragile.

### 4. Make the first end-to-end surface a dry-run `plan` command

The first user-visible command should be `meow-flow plan`. It should read the team config, compute repository candidates and worktree allocation descriptors, and print either a concise summary or structured JSON.

This creates a real integration surface for tests without forcing this change to also define worker execution or Git side effects. Hiding config loading behind future commands would leave no way to verify the feature in isolation.

### 5. Represent worktree allocation as deterministic planning data

This change should not create worktrees, but it should define the allocation data that future execution will consume. For each selected repository, the planner should emit stable metadata such as repository id, resolved root path, worktree naming theme, and the parent location or base path future commands will use.

That keeps the behavior explicit and testable while avoiding premature coupling to Git command execution.

### 6. Treat TypeScript and path-alias loading as a first-class implementation constraint

Because the config may import `@/...` modules, the implementation must evaluate the config with the owning project's TypeScript context instead of assuming plain Node ESM resolution will succeed. The coding lane should decide whether a runtime dependency such as `tsx` is sufficient in production or whether a narrower supported-loading contract is safer for v1.

Ignoring this constraint would produce a design that works only for trivial configs and fails on the example that motivated the feature.

## Risks / Trade-offs

- [Runtime loading behavior can differ across user projects] -> Start with `team.config.ts` in Node-compatible TypeScript repos and cover alias-based imports with a fixture before claiming broad support.
- [A narrow v1 schema may need expansion soon] -> Keep the first schema focused on fields already referenced by planning, while tolerating unrelated top-level config growth where safe.
- [Command UX may change as execution features arrive] -> Provide JSON output in addition to human output so future commands can reuse the planning API even if display text evolves.
- [Worktree allocation assumptions may drift from future execution needs] -> Emit neutral allocation descriptors instead of Git side effects or daemon-specific state.

## Migration Plan

- Ship `meow-flow plan` alongside the existing root help and version behavior.
- Keep the new planning APIs internal to `meow-flow` and `meow-flow-core`; no persisted data migration is required.
- Let later execution commands consume the same normalized config and allocation data instead of re-reading config ad hoc.

## Open Questions

- Should v1 discovery support only `team.config.ts`, or should `.js` and `.mjs` siblings also be accepted when present?
- Should repository selection in `meow-flow plan` be config-only in v1, or should the command also accept explicit repository id filters?
- What exact worktree parent-path convention should future execution use if the config does not declare one explicitly?
