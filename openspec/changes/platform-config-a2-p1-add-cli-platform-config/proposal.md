## Why

Meow Team already has a GitHub-specific platform adapter and shared CLI
execution helpers, but platform selection is still hardcoded in code and there
is no operator-facing command for changing it per repository. Adding a small
`meow-team` CLI now creates the first repo-local configuration surface, keeps
GitHub as the safe unset default, and gives future settings a clear namespace
without asking owners to edit code or memorize raw `git config` commands.

## What Changes

- Introduce the `platform-config-a2-p1-add-cli-platform-config` OpenSpec
  change for proposal "Add CLI platform config".
- Add a Clipanion-based `meow-team` CLI entrypoint, exposed through the
  repository's `pnpm` workflow, with a `config` namespace that can grow beyond
  platform selection.
- Add `meow-team config platform github|ugit` to resolve the current Git
  repository, write the selected value to repository-local git config under
  `meow-team.platform`, and fail clearly when run outside a Git repository or
  worktree.
- Add a small helper layer for repository-local harness config reads and
  writes so future settings can reuse the same git-config boundary.
- Rework `lib/platform` resolution so GitHub remains the default when no
  platform is configured, while an explicitly configured `ugit` selection is
  accepted by configuration but fails early and clearly until a real adapter
  exists.
- Add targeted regression coverage for CLI execution, repo-local config
  persistence, and repository-aware platform resolution; validate with
  `pnpm fmt`, `pnpm lint`, relevant tests, and `pnpm build`.

## Capabilities

### New Capabilities

- `platform-config-a2-p1-add-cli-platform-config`: Provide a Clipanion-based
  `meow-team` CLI, persist repository-local platform selection in git config,
  and route platform resolution through that config while keeping GitHub as the
  unset default and failing explicitly for configured `ugit`.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat(cli/platform): wire cli platform config`
- Conventional title metadata: `feat(cli/platform)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code and tests: `package.json`, `pnpm-lock.yaml`, a new
  `meow-team` CLI entrypoint and config command modules, repository-local
  config helpers backed by `git config --local`, `lib/platform/index.ts`,
  `lib/platform/types.ts`, and related Vitest coverage
- Affected systems: local Git config for repository worktrees, CLI execution
  through `pnpm`, and GitHub publication or pull-request flows that currently
  assume a hardcoded platform
- `ugit` adapter implementation remains out of scope for this change; only
  configuration acceptance and explicit unsupported-provider failures are
  expected
- Planner deliverable: Single proposal recommended because Clipanion bootstrap,
  repo-local config persistence, and repository-aware platform resolution all
  need to land together to produce a usable operator-facing command
