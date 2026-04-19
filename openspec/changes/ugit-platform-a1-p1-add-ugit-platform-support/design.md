## Context

The repository already accepts `meow-team.platform=ugit` through the existing
repo-local config path, but `lib/platform/index.ts` still registers only the
GitHub adapter and raises an unsupported-platform error for ugit. The current
GitHub adapter and shared platform types assume GitHub-style repository,
branch, commit, and pull-request URLs, while `lib/team/types.ts`,
`lib/team/history.ts`, and the coding or executing workflow modules still hard
code GitHub provider labels in persisted metadata and user-facing activity
strings. `ugit --help` currently exposes `pr create`, `pr edit`, `pr list`,
`pr sync`, and `serve`, and it infers the machine from repo-local Git config
`ugit.machine` when no override is passed.

## Goals / Non-Goals

**Goals:**

- Add a real ugit adapter under `lib/platform/ugit` that satisfies the
  existing `GitPlatformAdapter` contract.
- Keep repository selection on the current
  `readRepositoryHarnessConfig()` plus `resolveConfiguredGitPlatformId()`
  path, with GitHub remaining the default when `meow-team.platform` is unset.
- Publish ugit-backed branches and synchronize ugit pull requests using the
  documented ugit CLI commands and repository-local machine resolution.
- Generalize shared platform, history, and workflow metadata so ugit-backed
  repositories can persist branch or pull-request tracking without GitHub-only
  assumptions.
- Add targeted tests for adapter dispatch, ugit behavior, and provider-aware
  harness copy or persistence.

**Non-Goals:**

- Add a new config mechanism beyond the existing repository-local
  `meow-team.platform` setting.
- Provision ugit machines, implement `ugit create`, or manage ugit server
  lifecycle.
- Introduce support for any third-party platform other than ugit.
- Redesign the approval, archive, or delete workflow beyond making its
  platform metadata and copy provider-aware.

## Decisions

### Add `lib/platform/ugit` behind the existing adapter registry

The implementation should add a ugit adapter and register it in
`lib/platform/index.ts` so repository-aware platform resolution keeps using the
current config path. GitHub remains the default for repositories with no local
platform setting, and unknown platform identifiers keep the explicit error
path.

Alternative considered: special-casing ugit in harness callers instead of in
the adapter registry. This was rejected because it would duplicate platform
selection logic and leave `resolveGitPlatform()` as an incomplete abstraction.

### Wrap ugit CLI access in a small helper and keep URLs nullable

The ugit adapter should centralize command execution in a thin helper that can
invoke `ugit pr list`, `pr create`, `pr edit`, and `pr sync`, then parse only
the fields needed for branch and pull-request tracking. Because `ugit --help`
does not document a stable JSON output mode or guaranteed browser URLs, shared
platform result types should allow repository, branch, commit, and pull-
request URLs to be nullable while preserving identifiers such as remote name,
machine, repository reference, commit hash, and pull-request state.

Alternative considered: synthesizing GitHub-style URLs or requiring an
explicit machine override for every ugit command. This was rejected because it
would encode unsupported assumptions and ignore the existing repo-local
`ugit.machine` behavior.

### Generalize harness metadata and activity copy by provider

`TeamPullRequestRecord`, pushed-commit metadata, history persistence, and the
coding or executing workflow copy should treat the provider as explicit data
rather than assuming GitHub. The implementation should extend provider unions
to include `ugit`, preserve existing GitHub and `local-ci` behavior, and route
activity strings through provider-aware wording so ugit-backed repositories do
not present misleading GitHub labels during publish, review, or finalization.

Alternative considered: mapping ugit to existing `github` metadata and keeping
GitHub-branded copy. This was rejected because it would store incorrect state
and produce misleading operator output.

### Test repository-aware dispatch and null-URL behavior directly

The highest-risk regressions are adapter selection, ugit command routing, and
workflow persistence when URL fields are unavailable. The change should add
focused Vitest coverage around temporary-repository platform resolution, ugit
adapter command behavior, and history or activity formatting paths that must
continue working when commit or pull-request URLs are `null`.

Alternative considered: relying only on one broad end-to-end workflow test.
This was rejected because ugit environment availability and CLI output parsing
make smaller, deterministic tests a better fit for regression coverage.

## Conventional Title

- Canonical request/PR title: `feat(platform/ugit): support ugit platform`
- Conventional title metadata: `feat(platform/ugit)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [ugit CLI output may be human-oriented] -> Isolate parsing inside
  `lib/platform/ugit` and store nullable URLs when ugit cannot return stable
  browser links.
- [Existing thread history already persists GitHub-shaped records] -> Widen
  shared record types compatibly and default missing legacy fields to safe
  values during reads.
- [GitHub-branded copy is spread across multiple workflow modules] -> Audit
  both `lib/team/coding/*` and `lib/team/executing/*` plus the related tests
  in the same change.
- [One Node process can touch repositories with different providers] -> Keep
  adapter resolution per repository via the existing config resolution path and
  avoid global provider caching.

## Migration Plan

1. Add the ugit command helper and adapter modules under `lib/platform/ugit`
   and widen shared platform result types for provider-specific metadata.
2. Register ugit in repository-aware platform resolution and update harness
   persistence or workflow modules to store provider-aware pull-request and
   pushed-commit records.
3. Update operator-facing copy and tests so ugit-backed repositories no longer
   present GitHub-only behavior.
4. Validate with `pnpm fmt`, `pnpm lint`, targeted Vitest coverage, and
   `pnpm build`.

## Open Questions

- None. If ugit exposes a stable machine-readable output mode during
  implementation, prefer it; otherwise keep parsing narrow and URL fields
  nullable.
