## Why

The repository already routes publish and pull-request behavior through
`lib/platform`, but it still has no supported CLI surface for repository-local
platform selection and `lib/platform/index.ts` is hard-wired to GitHub. This
change adds a reviewable contract for persisting a per-repository platform
choice now so future `ugit` support has an explicit entry point and unsupported
selection stops silently behaving like GitHub.

## What Changes

- Introduce the `platform-config-a1-p1-add-cli-platform-config` OpenSpec
  change for proposal "Add CLI platform config".
- Bootstrap a Clipanion-based `meow-team` CLI entrypoint that runs outside the
  Next.js app and exposes `meow-team config platform <github|ugit>` as the
  first stable command surface.
- Resolve the target repository from `process.cwd()`, fail fast when the
  command is run outside a git repository, and add a focused helper for
  repository-local git config reads and writes backed by the existing git
  runner.
- Persist the selected platform under `meow-team.platform`, keep the config
  layer extensible for future `meow-team config ...` subcommands, and widen the
  platform ID surface to include `ugit`.
- Refactor platform resolution so runtime adapter lookup is repository-scoped,
  GitHub remains the default when no config is set, and configured `ugit` fails
  explicitly until a real adapter exists.
- Add regression coverage for command parsing, repository discovery, repo-local
  config persistence, default GitHub fallback, and unsupported-platform failure
  paths.
- Keep actual `ugit` adapter behavior, global user config, and unrelated team
  workflow changes out of scope.

## Capabilities

### New Capabilities

- `platform-config-a1-p1-add-cli-platform-config`: Add a Clipanion-based
  `meow-team` CLI command for repository-local platform configuration, store
  the selected platform in local git config, and resolve platform adapters per
  repository path with explicit unsupported-platform failures for `ugit`.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat(cli/platform): wire cli platform config`
- Conventional title metadata: `feat(cli/platform)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected areas: `package.json`, a new CLI entry surface, repository discovery
  plus git-config helpers, `lib/platform/**/*`, and targeted tests around CLI
  parsing and platform resolution
- New dependency: `clipanion`
- Config surface: repository-local git config key `meow-team.platform`
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Queue note: the coder/reviewer pool stays idle until a human approves this
  proposal
- Planner deliverable: Proposal 1: `Add CLI platform config`. Objective:
  bootstrap a Clipanion-based `meow-team` CLI, add
  `meow-team config platform [github|ugit]` backed by repository-local git
  config, and refactor platform resolution so GitHub remains the default while
  unsupported `ugit` selection fails explicitly instead of silently using the
  GitHub adapter.
