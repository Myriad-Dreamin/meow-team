## Context

Meow Team already centralizes `git` command execution in `lib/cli-tools/git.ts`
and exposes GitHub-specific behavior through `lib/platform/gh`, but
`lib/platform/index.ts` currently exports a hardcoded `githubPlatformAdapter`
and `GitPlatformId` only includes `github`. There is also no end-user CLI
entrypoint in `package.json`, so repository owners cannot switch providers
without code changes or manual local git-config edits. This change needs to
add the first operator-facing CLI surface while keeping the repo TypeScript-
first, `pnpm`-managed, and safe for current GitHub-only workflows.

## Goals / Non-Goals

**Goals:**

- Bootstrap a Clipanion-based `meow-team` CLI that runs through the
  repository's `pnpm` workflow.
- Add a `config` namespace and `config platform` command for repository-local
  platform selection.
- Persist the selected platform under a dedicated local git config key,
  `meow-team.platform`, and create a small helper layer for future settings.
- Resolve Git platform operations per repository so GitHub remains the default
  when unset while configured `ugit` fails clearly until an adapter exists.
- Add focused regression coverage for CLI behavior, repo-local config writes,
  and repository-aware platform resolution.

**Non-Goals:**

- Implement a real `ugit` adapter, authentication flow, or provider-specific
  publish and pull-request behavior.
- Add global or user-level meow-team config outside the current repository.
- Rename the package, redesign unrelated CLI surfaces, or add interactive
  configuration workflows beyond `config platform`.
- Change GitHub behavior for repositories that do not opt into any platform
  config.

## Decisions

### Use a pnpm-managed Clipanion entrypoint and keep it thin

The repo will add `clipanion` and expose a `meow-team` executable through
package metadata so owners can run the command from the workspace via
`pnpm exec meow-team ...` or the installed local bin. The entrypoint should
only parse commands and delegate to library helpers, keeping business logic in
normal modules that remain easy to unit-test.

Alternative considered: document raw `git config` commands or add an ad-hoc
Node script. This was rejected because it would not establish a reusable,
testable CLI contract for future repository settings.

### Store repository-local harness settings in git config under `meow-team.*`

A small helper layer should resolve the current repository root with
`git rev-parse --show-toplevel` or an equivalent check and then read or write
settings through `git config --local`. The first key is
`meow-team.platform`. This keeps configuration attached to each repository or
worktree, matches the request for local git config, and gives future settings
one stable namespace.

Alternative considered: a committed dotfile or global `git config`. This was
rejected because the request is explicitly repository-local and the setting
must not leak across unrelated repositories.

### Accept `ugit` in configuration but keep runtime selection strict

`GitPlatformId` should expand to include `ugit`, and config helpers should
validate against known IDs. The `config platform` command must allow either
`github` or `ugit` to be stored, but runtime platform resolution must only
return the GitHub adapter today. When the configured value is `ugit` or any
other unsupported value is encountered, platform operations should fail before
invoking GitHub-specific logic or `gh`.

Alternative considered: silently falling back to GitHub when `ugit` is
configured. This was rejected because it would hide operator intent and make
future provider debugging harder.

### Resolve platform per repository instead of through a module-level singleton

Rather than exporting one hardcoded `gitPlatform` constant, `lib/platform`
should resolve the adapter using the repository path already passed into
publish, remote-resolution, and pull-request operations. This keeps the
default path unchanged for repositories with no config while making provider
selection explicit and testable.

Alternative considered: caching a global adapter at process start. This was
rejected because different repositories or worktrees may carry different local
config inside the same Node process.

### Cover the change with temp-repository tests around CLI, config, and resolution

The highest-risk behavior is repository-local persistence and runtime
selection, not Clipanion parsing alone. Tests should create temporary Git
repositories, invoke the config helpers or command surface, assert
`git config --local` writes, and verify GitHub default versus explicit
unsupported-provider failures.

Alternative considered: only testing command classes in isolation. This was
rejected because it would miss the actual `git config --local` contract.

## Conventional Title

- Canonical request/PR title: `feat(cli/platform): wire cli platform config`
- Conventional title metadata: `feat(cli/platform)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [CLI bootstrap inside a Next.js repo] -> Keep the entrypoint minimal and
  move reusable logic into library modules so tests and future commands do not
  depend on app runtime assumptions.
- [Running outside a Git repository] -> Resolve the repository root first and
  surface actionable error text before attempting config writes.
- [Operators may select `ugit` before it exists] -> Accept the config write
  but fail fast with explicit unsupported-provider messaging in platform
  operations.
- [Repo-local config can be edited manually] -> Validate configured values and
  treat unknown IDs as explicit errors instead of silently choosing GitHub.

## Migration Plan

1. Add `clipanion` and expose the `meow-team` bin through the repo's
   `pnpm`-managed workspace tooling.
2. Add repository config helpers and implement `config platform` around
   `meow-team.platform`.
3. Rework platform resolution to read config per repository and preserve
   GitHub as the unset default.
4. Add regression coverage and validate with `pnpm fmt`, `pnpm lint`,
   relevant Vitest coverage, and `pnpm build`.

## Open Questions

- None for the approved scope. If later needed, a read-only
  `meow-team config platform` display mode or a real `ugit` adapter should
  land as follow-up changes rather than inside this bootstrap.
