## Context

Meow Team already has a shared `GitPlatformAdapter` contract and a GitHub
implementation under `lib/platform/gh`, while repository-local platform
selection lives in git config under `meow-team.platform`. The current
resolution flow defaults to GitHub when unset, but an explicit `ugit` selection
still fails as unsupported. This change needs to add a real adapter under
`lib/platform/ugit`, route the existing platform entrypoints through it when
configured, and keep ugit-specific behavior isolated from the rest of the team
workflow.

## Goals / Non-Goals

**Goals:**

- Add a first-class `lib/platform/ugit` adapter that satisfies the shared
  `GitPlatformAdapter` contract.
- Resolve platform operations per repository from `meow-team.platform`, keeping
  GitHub as the unset default and dispatching `ugit` repositories to the new
  adapter.
- Support ugit URL normalization plus branch publish and pull-request create /
  edit / sync flows through a small ugit CLI wrapper.
- Preserve the current repository-config schema and avoid spreading provider
  conditionals through unrelated team execution modules.
- Add focused regression coverage for local-config-based adapter selection and
  ugit publish / PR synchronization behavior.

**Non-Goals:**

- Redesign `meow-team config platform`, add new config keys, or change the
  repository-local config UX.
- Add support for providers beyond `github` and `ugit`.
- Refactor unrelated team orchestration code outside the adapter boundary.
- Introduce global caching or cross-repository platform state.

## Decisions

### Add a dedicated `lib/platform/ugit` adapter that mirrors the GitHub boundary

The ugit implementation should live in its own adapter directory and expose the
same operations the GitHub adapter already provides. That keeps the shared
platform entrypoints stable and lets callers keep depending on the
`GitPlatformAdapter` contract instead of branching on provider IDs.

Alternative considered: inline `ugit` branches into `lib/platform/index.ts` or
team execution code. This was rejected because it would weaken the adapter
boundary and make future provider-specific maintenance harder.

### Resolve adapters per repository from local git config

`lib/platform/index.ts` should read the repository-local platform identifier and
select `github` or `ugit` for each operation. GitHub remains the default only
when the key is unset, while unknown values still fail with an actionable
unsupported-platform error.

Alternative considered: keeping a module-level GitHub singleton and special-
case ugit call sites. This was rejected because repositories in the same Node
process can carry different local config.

### Hide ugit CLI differences behind a thin helper layer

The ugit adapter should rely on a small helper or command-runner module that
encapsulates `ugit pr create`, `ugit pr edit`, `ugit pr sync`, and `ugit pr
list` invocation plus any output parsing needed by the shared adapter contract.
This keeps adapter methods readable and limits fallout if ugit output formats
or flags differ from GitHub CLI behavior.

Alternative considered: shelling out directly from every adapter method. This
was rejected because it would duplicate command construction and parsing logic.

### Delegate URL normalization through the selected adapter

Shared URL normalization should stop assuming GitHub-only behavior and instead
route through the resolved adapter or otherwise dispatch explicitly for ugit.
That keeps published URLs and remote-derived metadata aligned with the selected
platform.

Alternative considered: leaving GitHub normalization hardcoded while only
changing publish and PR operations. This was rejected because it would leave
ugit repositories with incorrect remote URLs and inconsistent downstream links.

### Cover selection and ugit flows with temp-repository tests

The highest-risk behavior is not the existence of another adapter module but the
fact that local git config must switch the runtime path cleanly. Tests should
assert GitHub-default behavior when unset, ugit dispatch when configured, and
focused ugit publish / PR sync behavior through mocked CLI runners or temporary
repositories.

Alternative considered: only adding unit coverage inside the ugit adapter. This
was rejected because it would not prove config-based dispatch from the shared
entrypoints.

## Conventional Title

- Canonical request/PR title: `feat(platform/ugit): add ugit platform support`
- Conventional title metadata: `feat(platform/ugit)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [ugit CLI output differs from `gh`] -> Keep parsing inside a thin ugit helper
  layer and adapt adapter internals without changing the shared contract.
- [GitHub-only normalization leaks into ugit flows] -> Route normalization
  through the selected adapter and add regression tests for ugit remotes.
- [Different repositories need different providers in one process] -> Resolve
  the adapter from repository-local config for every platform operation.
- [`ugit` may be missing in some environments] -> Fail with actionable command
  errors only for repositories explicitly configured to use ugit.

## Migration Plan

1. Add the ugit adapter modules and any helper wrappers under `lib/platform/ugit`.
2. Rework shared platform resolution and URL normalization to dispatch by
   repository-local config.
3. Add focused tests for config-driven dispatch, ugit publishing, and ugit PR
   synchronization.
4. Validate with `pnpm fmt`, `pnpm lint`, focused Vitest runs, and `pnpm build`.

## Open Questions

- Which ugit commands provide the most stable machine-readable output for
  pull-request lookup and edit flows, and whether any fallback parsing is needed
  beyond `ugit --help` guidance.
