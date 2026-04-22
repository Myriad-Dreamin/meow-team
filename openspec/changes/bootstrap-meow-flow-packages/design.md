## Context

The repository is a pnpm workspace with an explicit package list in `pnpm-workspace.yaml` and an established TypeScript package pattern for both libraries and CLIs. The requested change adds two new workspace packages with different roles: a reusable core library and a dedicated CLI. The existing `packages/cli` package already provides the repository's baseline structure for Commander-based entrypoints, version resolution, bin wrappers, and lightweight process-level tests, while library packages such as `packages/highlight` define the usual `dist`, `exports`, and declaration output conventions.

This change crosses the workspace root and two new packages, but it deliberately avoids touching Paseo runtime behavior, daemon protocols, or application code. The main constraint is that the new package names are outside the repository's current `@getpaseo/*` release conventions, so the design should keep the initial scope local and bootstrap-oriented.

## Goals / Non-Goals

**Goals:**
- Add `@myriaddreamin/meow-flow-core` as a buildable workspace library package.
- Add `meow-flow` as a buildable workspace CLI package with a runnable bin entrypoint.
- Provide a root `cli:meow-flow` alias for source-based local execution.
- Add deterministic tests covering `--version` and `--help` behavior through the requested alias.

**Non-Goals:**
- Implement any Meow Flow subcommands or domain logic.
- Expand the repository's publish and release automation to cover the new package names.
- Modify existing Paseo CLI behavior or any server, app, desktop, or relay functionality.

## Decisions

### Register both packages explicitly in the workspace

The workspace file uses a fixed package list rather than a glob, so both `packages/meow-flow-core` and `packages/meow-flow` will be added explicitly.

Alternative considered:
- Use a broader workspace glob.

Rationale:
- The repository already relies on an explicit package inventory, and changing that convention would widen scope beyond the user's request.

### Model `meow-flow-core` as a standard TypeScript library package

`@myriaddreamin/meow-flow-core` will use a library structure similar to existing publishable packages: `src/index.ts`, TypeScript build output in `dist`, generated declarations, and package exports.

Alternative considered:
- Keep the core package source-only with no build output yet.

Rationale:
- A buildable library package is the smallest useful bootstrap state for downstream work and matches the repository's existing packaging conventions.

### Model `meow-flow` after the existing CLI package, but keep the surface minimal

`meow-flow` will follow the repository's current CLI pattern: a small `src/index.ts` entrypoint, a `src/cli.ts` module that constructs the Commander program, a `src/version.ts` helper that resolves the package version, and a `bin/meow-flow` wrapper that targets the compiled entrypoint.

Alternative considered:
- Reuse the existing Paseo CLI package and add a new subcommand namespace.

Rationale:
- The user explicitly requested a separate package that resembles `packages/cli`, not an extension of the existing CLI.

### Validate the bootstrap contract through the root alias

The foundation test will invoke `npm run cli:meow-flow -- --version` and `npm run cli:meow-flow -- --help` instead of calling the package entrypoint directly.

Alternative considered:
- Test the compiled `dist/index.js` file only.

Rationale:
- The alias itself is part of the requested behavior, and testing it directly ensures the root-level contract remains valid.

## Risks / Trade-offs

- [Non-standard package names for this repo] → Keep the change scoped to workspace scaffolding and document that release automation is out of scope for this slice.
- [Early package structure may need adjustment once real Meow Flow features exist] → Keep the initial public API and CLI surface intentionally minimal to reduce future migration cost.
- [Testing only the bootstrap behavior can miss future regressions in package composition] → Establish the narrow foundation test now and let later changes add command-specific coverage as the CLI grows.

## Migration Plan

There is no runtime migration for existing users because the new packages are additive and unreferenced by current shipped flows. Implementation should proceed by adding the workspace entries, scaffolding both packages, adding the root alias, and running targeted validation plus repository-wide typecheck and format.

Rollback is straightforward: remove the new workspace entries, packages, and root alias if the bootstrap needs to be reverted before downstream features depend on it.

## Open Questions

- Should later release automation synchronize versions for `meow-flow` and `@myriaddreamin/meow-flow-core`, or should they remain outside the existing `@getpaseo/*` release flow?
- Should `meow-flow` depend on `@myriaddreamin/meow-flow-core` immediately, or should that dependency be added only when real shared functionality lands?
