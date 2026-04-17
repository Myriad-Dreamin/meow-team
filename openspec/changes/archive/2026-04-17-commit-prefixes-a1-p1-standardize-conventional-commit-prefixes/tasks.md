## 1. Shared Commit Prefix Mapping

- [x] 1.1 Add a shared harness commit-message formatter or classifier that
      emits lowercase `docs:`, `dev:`, `fix:`, and `test:` subjects and defaults
      ambiguous internal work to `dev:`
- [x] 1.2 Add focused unit coverage for deterministic mapping, including
      ambiguous internal work, proposal or archive commits, repair-oriented work,
      and explicit test-only runs

## 2. Planner And Coder Integration

- [x] 2.1 Update `lib/team/openspec.ts` so planner proposal materialization
      commits use the shared formatter and emit `docs:` instead of `planner:`
- [x] 2.2 Update `lib/team/coding/reviewing.ts` so implementation, proposal or
      archive, repair, and test-only commits route through the shared
      `dev:` / `docs:` / `fix:` / `test:` mapping without changing request or PR
      title behavior

## 3. Prompt Guidance

- [x] 3.1 Update coder lane prompt guidance so any direct `git commit` commands
      use the same lowercase conventional prefix rules as harness-managed commits
- [x] 3.2 Update reviewer and archive-oriented prompt guidance so direct commit
      commands use `docs:` for proposal or archive updates, `fix:` for repair work,
      `test:` for explicit test-only changes, and `dev:` otherwise

## 4. Regression Coverage And Validation

- [x] 4.1 Extend `lib/git/ops-materialization.test.ts`,
      `lib/team/openspec.test.ts`, and `lib/team/coding/index.test.ts` coverage for
      the formatter and commit call sites across proposal materialization, coding,
      repair, test-only, and archive flows
- [x] 4.2 Run `pnpm fmt`, `pnpm lint`, and the relevant automated tests for the
      commit-prefix formatter and harness commit flows before review
