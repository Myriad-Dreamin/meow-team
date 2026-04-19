## Context

`lib/config/runtime.ts` currently reads Codex user config and auth data once at module import time, exports the merged result as `teamRuntimeConfig`, and leaves long-lived Next.js server modules holding that frozen snapshot. Agent-start paths such as `lib/agent/codex-cli.ts`, `app/api/team/run/route.ts`, and `lib/team/thread-actions.ts` therefore miss later edits to `~/.codex/config.toml`, even though those edits only need to affect future launches.

## Goals / Non-Goals

**Goals:**

- Introduce a small runtime-config accessor that caches the last parsed snapshot and refreshes it when `~/.codex/config.toml` changes on disk.
- Ensure all launch-time gates and Codex CLI argument builders consume runtime config through that accessor so new runs see fresh settings.
- Preserve current merged-value precedence for model, base URL, API key, and missing-config messaging while adding focused reload tests.

**Non-Goals:**

- Hot-reload configuration inside already running Codex processes.
- Add a broader reload system for `team.config.ts` or unrelated application settings.
- Redesign workflow dispatch, lane allocation, or non-Codex configuration behavior.

## Decisions

- Replace direct `teamRuntimeConfig` consumption with a getter-style API that owns a module-local cache and the file metadata needed to decide when a refresh is required.
  - Alternative considered: re-importing `lib/config/runtime.ts` or relying on Next.js module invalidation. Rejected because server module caching is not tied to user-home config file changes.
- Use file stat checks on `~/.codex/config.toml` at the start of each agent launch or run gate, and only re-parse the runtime config when the tracked mtime differs from the cached value.
  - Alternative considered: re-reading the config file on every call. Rejected because it adds avoidable I/O and parsing overhead to every launch when the file is unchanged.
- Keep the merged config assembly logic centralized in `lib/config/runtime.ts`, so refresh behavior reuses the same env/auth precedence and missing-file handling that existing tests already cover.
  - Alternative considered: splitting refresh logic across callers. Rejected because it would duplicate precedence rules and increase the risk of stale checks.
- Scope reload to launch boundaries. Callers refresh before validating API-key presence or building Codex CLI args, but they do not mutate settings for an already spawned process.
  - Alternative considered: watching the file system and pushing live updates into running sessions. Rejected because the request only requires new launches to pick up changes.

## Risks / Trade-offs

- [Auth-only edits remain stale if config mtime never changes] -> Document this scope explicitly and keep the accessor structured so auth mtime tracking can be added later without rewiring callers.
- [Repeated stat calls add launch overhead] -> Limit the refresh check to agent-start and run-gating paths rather than every helper that reads runtime config.
- [Missing-file transitions can produce stale negatives] -> Treat missing config as cacheable state with explicit mtime markers so the next observed file creation triggers a refresh.
- [Caller drift] -> Replace imported snapshot usage at every launch-time entry point and cover those paths with targeted regression tests.

## Migration Plan

No data migration is required. After approval, implement the accessor, switch launch-time callers to it, add tests, and validate the changed runtime-config path before merging. Rollback is a straightforward revert to the previous import-time snapshot if unexpected launch regressions appear.

## Open Questions

- Should the same accessor also track `~/.codex/auth.json` mtime now, or should auth reload remain a documented follow-up if users need credentials to refresh independently?
