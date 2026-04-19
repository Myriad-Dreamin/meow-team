## 1. Runtime Config Accessor

- [ ] 1.1 Refactor `lib/config/runtime.ts` to expose a cached runtime-config accessor that tracks the last observed `~/.codex/config.toml` mtime and refreshes the parsed snapshot when it changes.
- [ ] 1.2 Preserve existing env, auth, and missing-config precedence while representing unchanged and missing-file states so later launches can decide whether a reload is needed.

## 2. Launch-Time Integration

- [ ] 2.1 Update Codex launch and run-gating call sites such as `lib/agent/codex-cli.ts`, `app/api/team/run/route.ts`, and `lib/team/thread-actions.ts` to read runtime config through the accessor at use time.
- [ ] 2.2 Ensure launch-time API-key checks and CLI argument construction consume the refreshed snapshot without changing behavior for already running Codex processes.

## 3. Regression Coverage

- [ ] 3.1 Add targeted tests for unchanged mtimes, changed mtimes, missing config files, and no-regression fallback precedence in the runtime-config path.
- [ ] 3.2 Run the relevant validation commands for the touched implementation and confirm the approved scope still matches `feat: refresh codex config on changes`.
