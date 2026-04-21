## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Watch and hot reload team config" and confirm the canonical request/PR title is `feat(team/config): enable team config hot reload`
- [x] 1.2 Confirm the proposal stays as one cohesive runtime-loader change, pooled coding-review work stays idle until approval, and conventional-title metadata `feat(team/config)` stays separate from change naming

## 2. Runtime Config Loader

- [x] 2.1 Add a server-only runtime team-config accessor under `lib/config` that resolves `process.cwd()/team.config.ts` by default, honors `REVIVAL_TEAM_CONFIG_PATH`, loads the effective TypeScript config module, and validates it through `defineTeamConfig`
- [x] 2.2 Cache the effective config together with file-state metadata so the next server-side read reloads when the target file appears, disappears, or changes mtime
- [x] 2.3 Provide test seams for override and cache reset behavior so runtime-loader tests can simulate file-state transitions without leaking global process state

## 3. Lazy Consumer Refactor

- [x] 3.1 Replace static `@/team.config` reads in `app/*` and `lib/team/*` server consumers with lazy access through the runtime accessor for repository roots, storage paths, notification targets, workflow metadata, and dispatch branch settings
- [x] 3.2 Refactor modules with top-level derived state, including `lib/team/roles/planner.ts` and `lib/team/roles/dependencies.ts`, so `dispatch.maxProposalCount` and `dispatch.workerCount` are rebuilt from current config on subsequent runs
- [x] 3.3 Ensure request-time dispatch-capacity checks and other orchestration entry points use the refreshed config without requiring a Next.js restart

## 4. Regression Coverage And Docs

- [x] 4.1 Add focused tests for default-path loading, `REVIVAL_TEAM_CONFIG_PATH` override behavior, reload-on-mtime-change, reload when a missing config later appears, and failure to keep stale config after removal
- [x] 4.2 Extend regression coverage for consumers that previously captured stale values, especially planner proposal limits and worker-count-driven executor or capacity wiring
- [x] 4.3 Update `README.md` to document the default config location, the env override, and the no-restart workflow for editing `team.config.ts`
- [x] 4.4 Run the required validation for this change: `pnpm fmt`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, and `pnpm build`
