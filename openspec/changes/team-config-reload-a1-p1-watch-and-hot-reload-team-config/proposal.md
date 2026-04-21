## Why

The harness currently imports `@/team.config` at module load time, which
freezes server-side configuration until the Next.js process restarts. That
blocks the owner from editing `team.config.ts` during a live session because
request handlers, page renders, queued executors, and planner limits keep using
stale boot-time values.

## What Changes

- Add a server-side runtime team-config accessor that resolves
  `process.cwd()/team.config.ts` by default, honors
  `REVIVAL_TEAM_CONFIG_PATH`, loads the TypeScript module, and validates the
  resulting config through `defineTeamConfig`.
- Cache the loaded config with file-state tracking so the next server-side read
  reloads when the target config file appears, disappears, or changes mtime.
- Refactor server consumers in `app/*` and `lib/team/*` to read config lazily
  instead of capturing `teamConfig` or derived state at module scope, including
  planner proposal limits and queued executor concurrency.
- Route request-time reads for repository roots, storage paths, notification
  targets, workflow metadata, dispatch branch settings, and worker capacity
  through the runtime accessor so updated values apply without restarting Next.
- Add focused regression tests for default-path loading, env override behavior,
  reload-on-change behavior, missing-file transitions, and consumers that
  previously captured stale config.
- Update `README.md` to document the default config location, the
  `REVIVAL_TEAM_CONFIG_PATH` override, and the no-restart workflow for
  server-side team-config edits.

## Capabilities

### New Capabilities
- `team-config-reload-a1-p1-watch-and-hot-reload-team-config`: Load the team
  configuration at runtime from the default or overridden path, refresh it on
  file changes, and make server-side consumers observe updated settings on
  subsequent reads without a process restart.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(team/config): enable team config hot reload`
- Conventional title metadata: `feat(team/config)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code paths: `team.config.ts`, `lib/config/*`, `app/page.tsx`,
  `app/api/team/*`, `lib/team/history.ts`, `lib/team/server-state.ts`,
  `lib/team/thread-actions.ts`, `lib/team/thread-command-server.ts`,
  `lib/team/roles/planner.ts`, `lib/team/roles/dependencies.ts`, and related
  tests
- Systems affected: server-side config loading, request-time dispatch capacity,
  planner proposal limits, repository discovery, thread storage path
  resolution, notification targeting, and owner documentation in `README.md`
