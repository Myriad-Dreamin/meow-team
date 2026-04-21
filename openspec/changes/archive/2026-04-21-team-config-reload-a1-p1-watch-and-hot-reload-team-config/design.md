## Context

`team.config.ts` is currently imported as a normal application module and its
`teamConfig` export is captured at module scope across `app/*` and `lib/team/*`
consumers. That makes config-owned values effectively immutable for the life of
the server process, including planner schema limits, queued executor
concurrency, repository roots, storage paths, and notification targets. The
requested behavior is to keep the existing `team.config.ts` and
`defineTeamConfig` contract, but move server-side reads to a runtime loader
that follows the effective config file path and refreshes after file changes.

## Goals / Non-Goals

**Goals:**
- Load the effective team config from `process.cwd()/team.config.ts` by default
  and allow `REVIVAL_TEAM_CONFIG_PATH` to override that target.
- Revalidate the effective config on subsequent server-side reads when the file
  appears, disappears, or changes mtime, without requiring a Next.js restart.
- Replace top-level config capture in request handlers, page renders, and role
  wiring so new config values affect later requests and orchestration
  decisions.
- Preserve the existing `defineTeamConfig` parsing boundary and document the
  new editing workflow in `README.md`.
- Add regression coverage for path resolution, cache invalidation, and the
  consumers that currently freeze `maxProposalCount` or `workerCount`.

**Non-Goals:**
- Pushing config changes to already-running browser clients or Codex
  subprocesses.
- Retrofitting persisted assignments or living threads so historical decisions
  are rewritten after a config edit.
- Expanding the team-config schema beyond the runtime-loading seams needed for
  this change.
- Providing a last-known-good fallback when the config is temporarily invalid
  during editing.

## Decisions

1. Add one server-only runtime team-config accessor under `lib/config`.
   Rationale: centralizing path resolution, file-state tracking, loading, and
   validation avoids duplicating cache logic across request handlers and team
   modules. The accessor can expose both the parsed config and metadata about
   the effective file path so tests can reset and override it deterministically.
   Alternatives considered:
   - Keep importing `@/team.config` and add ad hoc invalidation. Rejected
     because module-scope imports still freeze derived state in every consumer.
   - Replace `team.config.ts` with a JSON-only file. Rejected because the
     request explicitly keeps the existing TypeScript and `defineTeamConfig`
     contract.

2. Load the config file through a project-scoped TypeScript module bridge
   instead of a static bundler import.
   Rationale: the runtime path is not known at build time, and the effective
   file may move through `REVIVAL_TEAM_CONFIG_PATH`. A dedicated loader can
   resolve the effective file path, transpile the target TypeScript module for
   Node execution, honor the repository `@/` alias, and evict the config module
   from its module cache before reloads.
   Alternatives considered:
   - Add another external runtime loader dependency. Rejected because the repo
     already ships `typescript`, and the config loading surface is narrow enough
     to keep the bridge local.
   - Depend on build-time Next.js module evaluation. Rejected because an
     arbitrary runtime override path cannot be bundled ahead of time.

3. Invalidate the cached config from filesystem snapshots, not background file
   watchers.
   Rationale: the requested hot reload only needs to apply on the next
   server-side read. Comparing existence plus `mtimeMs` on access keeps the
   implementation deterministic in both `pnpm dev` and `next start`, covers
   file creation and deletion, and avoids long-lived watcher cleanup.
   Alternatives considered:
   - `fs.watch` or chokidar-style listeners. Rejected because the request does
     not require push-style updates and watcher reliability varies across
     platforms and editor save flows.
   - Reloading on every read without caching. Rejected because repeated module
     evaluation would be unnecessary work for routes and components that read
     config frequently.

4. Refactor server-side consumers to call lazy accessors at the point of use,
   including modules with top-level derived state.
   Rationale: hot reload is only effective if consumers stop closing over stale
   config. `lib/team/roles/planner.ts` needs schema and prompt argument builders
   that read the current dispatch limits each run, and
   `lib/team/roles/dependencies.ts` needs queued executor creation to follow the
   latest worker count instead of a boot-time constant. Request handlers and
   server helpers should read current repository roots, storage paths,
   notification targets, workflow metadata, and dispatch settings through the
   same accessor.
   Alternatives considered:
   - Keep global singleton executors and mutate them in place on reload.
     Rejected because it complicates synchronization and still leaves other
     top-level readers stale.
   - Only update UI routes. Rejected because orchestration and API capacity
     checks are part of the requested runtime behavior.

5. Add explicit test seams for runtime config override and cache reset.
   Rationale: existing tests often mock `@/team.config` directly. The runtime
   accessor needs a resettable singleton and targeted override hooks so tests
   can simulate file creation, deletion, mtime changes, and consumer re-reads
   without mutating global process state across suites.

## Conventional Title

- Canonical request/PR title: `feat(team/config): enable team config hot reload`
- Conventional title metadata: `feat(team/config)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Runtime TypeScript loading differs between `pnpm dev` and `next start`] ->
  Keep the loader server-only, use one local module bridge for both modes, and
  cover default and override path loading in tests.
- [Consumer refactors miss a module-scope config capture] -> Search and replace
  all `@/team.config` imports in `app/*` and `lib/team/*`, then add regression
  tests around planner limits and worker-count-driven executors.
- [Temporary invalid config edits cause request failures] -> Accept the failure
  mode for this proposal and document that the next successful parse restores
  service without a restart.
- [Reload checks add request overhead] -> Limit filesystem work to a cheap
  existence plus `mtimeMs` snapshot comparison and reuse the cached parsed
  config when the snapshot is unchanged.

## Migration Plan

- Introduce the runtime accessor and switch server-side consumers from
  `@/team.config` imports to lazy reads in the same implementation pass.
- Update or replace tests that mock `@/team.config` so they target the runtime
  loader reset seam instead.
- Document the new default path, env override, and edit-without-restart
  workflow once the runtime accessor is in place.
- Rollback remains straightforward: restore the static `@/team.config` import
  path and remove the runtime accessor if the loader proves too fragile.

## Open Questions

- None. The approved scope is specific enough to proceed with the runtime
  loader, lazy consumer refactor, regression coverage, and documentation
  update.
