## Why

Codex agent launches currently reuse a `teamRuntimeConfig` snapshot that is computed once when `lib/config/runtime.ts` is imported. Edits to `~/.codex/config.toml` after the harness starts are therefore ignored until the server restarts, which makes model and provider changes slow to verify and easy to misdiagnose.

## What Changes

- Refactor Codex runtime config access behind an accessor that returns a cached snapshot instead of exporting a one-time module-level object.
- Refresh the parsed runtime config before each planner, coder, reviewer, and OpenSpec materializer Codex launch when `~/.codex/config.toml` has a newer mtime than the last successful load.
- Update run-gating and Codex CLI argument construction call sites to read the latest snapshot at use time rather than importing stale config data.
- Add targeted regression coverage for unchanged mtimes, changed mtimes, missing config files, and existing env/auth fallback precedence.

## Capabilities

### New Capabilities

- `reload-codex-config-a1-p1-add-mtime-aware-codex-runtime-config-reload`: Refresh the cached Codex runtime config snapshot at agent-start boundaries whenever the Codex user config file mtime changes so new launches pick up updated settings without restarting the harness.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: refresh codex config on changes`
- Conventional title metadata: `feat`

## Impact

- Affected files are expected in `lib/config/runtime.ts`, `lib/agent/codex-cli.ts`, `app/api/team/run/route.ts`, `lib/team/thread-actions.ts`, and related runtime-config tests.
- Planner, coder, reviewer, and OpenSpec materializer launches gain mtime-aware config refresh at start-of-run only; already running Codex processes remain unchanged.
- Current environment-variable and auth fallback precedence stays intact unless a small compatibility fix is required to keep launch-time checks correct.
