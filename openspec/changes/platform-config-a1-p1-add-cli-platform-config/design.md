## Context

The current repository has no package `bin` entry, no `clipanion` dependency,
and no standalone `meow-team` command surface. Platform behavior is also still
effectively global: `lib/platform/index.ts` exports a fixed
`githubPlatformAdapter`, `GitPlatformId` only includes `github`, and callers
such as branch publishing and pull-request synchronization cannot distinguish
between repositories with different desired git platforms.

This proposal adds three coupled pieces at once: a stable CLI surface, a
repository-local git-config storage layer, and repository-scoped platform
resolution. Those concerns need to land together so approval does not create a
command that cannot influence runtime behavior or a runtime refactor with no
supported way to change the selected platform.

Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Add a Clipanion-based `meow-team` CLI entrypoint with
  `config platform <github|ugit>` as the first supported command.
- Resolve the target repository from `process.cwd()` and fail clearly when the
  command runs outside a git repository.
- Persist platform selection in repository-local git config under
  `meow-team.platform` using the existing git runner instead of a new settings
  store.
- Refactor `lib/platform` so adapter selection is repository-scoped, existing
  GitHub behavior remains the default when no config is set, and configured
  unsupported platforms fail explicitly.
- Keep the config surface extensible for future `meow-team config ...`
  subcommands and add targeted regression coverage for the new CLI and
  resolution paths.

**Non-Goals:**

- Implement actual `ugit` remote normalization, push, or pull-request support
  in this change.
- Add global user-level config, database-backed settings, or repository path
  flags to the CLI.
- Rework unrelated coding-review workflow logic beyond the type and call-site
  changes required to resolve the active platform.
- Change default behavior for repositories that do not opt into a non-GitHub
  platform.

## Decisions

- Add a dedicated `meow-team` CLI root backed by Clipanion and keep command
  logic in shared TypeScript modules rather than custom argv parsing or
  `pnpm`-script-only entrypoints. A real command framework gives the repository
  a stable surface for future `config` expansion and clearer command help,
  validation, and testing.
  Alternative considered: a minimal hand-rolled parser in a Node script.
  Rejected because command routing, help text, and future subcommands would
  become ad hoc immediately.
- Resolve the current repository with git itself rather than manual path
  walking. The CLI should derive the target repository from `process.cwd()`,
  likely through a helper around `git rev-parse --show-toplevel`, so nested
  directories and worktrees behave like git expects.
  Alternative considered: require an explicit repository path argument.
  Rejected because the request is explicitly repository-local and common usage
  should work from anywhere inside the working tree.
- Add a focused repository-config helper on top of the existing git runner and
  store the platform under `meow-team.platform` in local git config. Reads
  should normalize the missing-key case instead of leaking raw git command
  failures, and writes should stay scoped to the repository's local config.
  Alternative considered: write `.git/config` directly or add a separate JSON
  settings file. Rejected because git already provides locking, scoping, and a
  familiar repository-local storage surface.
- Keep platform resolution behind the existing `lib/platform` facade, but make
  adapter lookup repository-scoped. `resolvePushRemote`, `publishBranch`, and
  `synchronizePullRequest` already receive `repositoryPath`, so they can select
  an adapter per repository without widening unrelated workflow APIs.
  Alternative considered: thread a platform adapter object through every caller.
  Rejected because it would unnecessarily widen the change into team
  orchestration internals.
- Expand `GitPlatformId` to include `ugit` now, but treat missing adapter
  support as an explicit runtime error. The CLI should allow selecting `ugit`
  so future work has a persisted switch to build on, while runtime operations
  fail loudly and predictably until the adapter exists.
  Alternative considered: silently map `ugit` back to GitHub. Rejected because
  it would hide misconfiguration and make future platform rollout ambiguous.
- Preserve current behavior when no platform config is present by defaulting to
  GitHub. That keeps existing repositories working without migration while
  still allowing per-repository overrides where explicitly configured.
  Alternative considered: require explicit configuration before any platform
  operation. Rejected because it would create unnecessary churn for existing
  GitHub-only workflows.

## Conventional Title

- Canonical request/PR title: `feat(cli/platform): wire cli platform config`
- Conventional title metadata: `feat(cli/platform)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [CLI runtime integration drift] -> Keep the package/bin wrapper thin and put
  command behavior in shared TypeScript modules that can be tested without
  invoking the full app runtime.
- [Repository discovery ambiguity in nested paths or worktrees] -> Use git's
  own repository-root resolution instead of manual directory walking.
- [Missing-config handling leaks raw git errors] -> Centralize local git-config
  reads in one helper that distinguishes "unset" from real command failure.
- [Users select `ugit` before support exists] -> Let the CLI store the desired
  value, but make runtime failures explicit, named, and covered by tests so the
  behavior is intentional rather than accidental.
- [Cross-cutting platform changes regress GitHub defaults] -> Keep repository
  path as the resolver input, default to GitHub when unset, and cover fallback
  plus explicit-GitHub cases in targeted tests.

## Migration Plan

No persisted data migration is required. Repositories without
`meow-team.platform` continue using GitHub by default, while repositories that
opt into the new CLI gain a local git-config entry only when the command is
run. Rollback is straightforward: remove the CLI/config helper path and ignore
or unset `meow-team.platform` in affected repositories.

## Open Questions

- None for the approved proposal scope. If the owner wants a different
  repository-local git-config key or an explicit repository-path argument, that
  should be handled as approval feedback before implementation starts.
