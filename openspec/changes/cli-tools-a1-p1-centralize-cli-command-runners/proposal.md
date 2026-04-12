## Why

Move the duplicated `git`, `gh`, and `openspec` exec wrappers into `lib/cli-tools` with one shared process runner, update the existing team and git modules to consume it, and preserve current behavior through validation and targeted tests. Refactor duplicated `git`/`gh`/`openspec` command runners into `lib/cli-tools` with one shared exec utility and no intended behavior change. This proposal is one candidate implementation for the request: there are many runGit, runGh, runOpenSpec. move these tools to `lib/cli-tools` with shared utility.

## What Changes

- Introduce the `cli-tools-a1-p1-centralize-cli-command-runners` OpenSpec change for proposal "Centralize CLI command runners".
- Move the duplicated `git`, `gh`, and `openspec` exec wrappers into `lib/cli-tools` with one shared process runner, update the existing team and git modules to consume it, and preserve current behavior through validation and targeted tests.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `cli-tools-a1-p1-centralize-cli-command-runners`: Move the duplicated `git`, `gh`, and `openspec` exec wrappers into `lib/cli-tools` with one shared process runner, update the existing team and git modules to consume it, and preserve current behavior through validation and targeted tests.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor: Centralize CLI command runners`
- Conventional title metadata: `refactor`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Centralize CLI command runners` Suggested OpenSpec seed: `centralize-cli-command-runners` Objective: Move the duplicated `runGit` implementations in `lib/git/ops.ts` and `lib/team/git.ts`, plus `runGh` in `lib/git/ops.ts` and `runOpenSpec` in `lib/team/openspec.ts`, into `lib/cli-tools` backed by one shared process-execution utility. Implementation shape: 1. Add `lib/cli-tools` with a shared runner for CLI process execution. 2. Create thin `git`, `gh`, and `openspec` adapters that preserve current command semantics. 3. Rewire existing callers to use the shared adapters without changing higher-level workflow behavior. 4. Cover the refactor with targeted tests for runner behavior and caller expectations. 5. Validate with `pnpm fmt`, `pnpm lint`, targeted tests, and `pnpm build` when shared module boundaries change. Scope boundaries and risks: - Keep the refactor behavior-preserving for current git/team/openspec flows. - Avoid expanding into unrelated CLI abstractions. - Watch for regressions in cwd handling, env injection, and fallback error messages. - Coding-review lanes stay idle until human approval arrives.
