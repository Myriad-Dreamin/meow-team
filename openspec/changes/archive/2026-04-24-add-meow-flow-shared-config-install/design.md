## Context

`packages/meow-flow` currently exposes only `plan`, and its config loader is intentionally anchored to `team.config.ts` in the current repository tree. The new requirement introduces a shared destination, `~/.local/shared/meow-flow/config.js`, plus an install command that can accept either `.js` or `.ts` source files. A literal copy is not safe: the current config format is executable code, and moving it into a home-directory location would break relative imports, path aliases, and any repository-relative directory fields unless the install step produces a portable artifact.

## Goals / Non-Goals

**Goals:**

- Add a stable shared config destination for `meow-flow`.
- Add `meow-flow config install <path>` with support for `.js` and `.ts` source files.
- Ensure a TypeScript-authored source becomes a JavaScript artifact before it is written to the shared location.
- Keep installed config loadable without relying on the original source file location.
- Preserve an explicit `--config` override while making default config loading shared-only.

**Non-Goals:**

- Adding execution or dispatch commands beyond the new install surface
- Supporting config file types beyond `.js` and `.ts`
- Preserving source comments, formatting, or helper imports in the installed artifact
- Designing multi-profile shared config switching in this change

## Decisions

### 1. Use a single canonical installed artifact path

The installed config target should always be `~/.local/shared/meow-flow/config.js`.

This keeps the runtime contract simple for later commands and avoids a second layer of discovery logic inside the shared directory. The source config can be `.ts` or `.js`, but the installed destination stays JavaScript.

### 2. Install a portable JavaScript artifact, not a raw file copy

`meow-flow config install` should evaluate the source config in its original project context, normalize it, and write a self-contained JavaScript module to the shared location.

This is the critical design choice. A raw copy, or even a plain TypeScript-to-JavaScript transpile, would still leave the installed file coupled to repo-relative imports and directory semantics. Re-emitting a portable object avoids broken imports after relocation and ensures repository directories remain valid from the shared location.

### 3. Reuse the existing loader and normalization pipeline

The install command should reuse the same source-module evaluation path that `plan` already uses, including `tsx`-based TypeScript loading and nearest-ancestor `tsconfig.json` resolution. After the raw config is loaded, the install path should reuse normalization helpers to emit a canonical object with absolute repository directories and stable field values.

This minimizes new behavior surfaces and keeps `plan` plus `config install` consistent about what a valid team config means.

### 4. Use shared config by default without local fallback

Commands that load config should resolve in this order:

1. `--config <path>`
2. `~/.local/shared/meow-flow/config.js`

The CLI should not fall back to local `team.config.ts` or `team.config.js` discovery. If the shared config is missing and the user did not pass `--config`, the command should fail with a diagnostic that points to `meow-flow config install <path>`. This makes the shared install the real source of truth instead of a preferred-but-optional cache.

### 5. Restrict accepted source types to `.js` and `.ts`

The install command should reject any other file extension before mutating the shared target.

This matches the requested support matrix and avoids ambiguous runtime behavior for `.mjs`, `.cjs`, JSON, or other config variants that the current code does not document.

## Risks / Trade-offs

- [Installed config bakes in absolute repository paths] -> Reinstall after moving a repository tree; document this explicitly in CLI help and README.
- [Removing local discovery may surprise users who still expect repo-local defaults] -> Keep `--config` explicit override and make the missing-install diagnostic point directly to `meow-flow config install <path>`.
- [Portable install output loses source comments and helper structure] -> Treat the shared file as generated runtime state, not an authoring surface.
- [Install and plan could drift if they use different validation paths] -> Route both through the same module evaluation and normalization helpers.

## Migration Plan

- Add the install command and shared-config path helpers.
- Update `plan` loading precedence to use explicit override first, then the shared artifact, and fail when neither is available.
- Add tests for `.ts` install, `.js` install, unsupported extensions, and config loading precedence.
- Update package docs to explain that the shared file is generated output and should be refreshed via `meow-flow config install`.

## Open Questions

- Should `config install` print a short notice when it overwrites an existing shared config from another repository?
