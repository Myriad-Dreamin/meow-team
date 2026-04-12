## Why

Create `lib/cli-tools` shared exec helpers for `git`, `gh`, and `openspec`, migrate the existing git/team/OpenSpec modules to those wrappers, and validate that command behavior and failure surfaces remain unchanged. Centralize the duplicated CLI process runners into `lib/cli-tools`, migrate the existing git/team/OpenSpec modules to those helpers, and validate that command behavior stays stable. This proposal is one candidate implementation for the request: there are many runGit, runGh, runOpenSpec. move these tools to `lib/cli-tools` with shared utility.

## What Changes

- Introduce the `cli-tools-a2-p1-centralize-cli-command-runners` OpenSpec change for proposal "Centralize CLI command runners".
- Create `lib/cli-tools` shared exec helpers for `git`, `gh`, and `openspec`, migrate the existing git/team/OpenSpec modules to those wrappers, and validate that command behavior and failure surfaces remain unchanged.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `cli-tools-a2-p1-centralize-cli-command-runners`: Create `lib/cli-tools` shared exec helpers for `git`, `gh`, and `openspec`, migrate the existing git/team/OpenSpec modules to those wrappers, and validate that command behavior and failure surfaces remain unchanged.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor: Centralize CLI command runners`
- Conventional title metadata: `refactor`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Centralize CLI command runners` Suggested OpenSpec seed: `centralize-cli-command-runners` Objective: move duplicated `git`, `gh`, and `openspec` exec wrappers into `lib/cli-tools` around one shared `execFile` utility while preserving current behavior. Implementation shape: 1. Add a shared command-execution helper in `lib/cli-tools` that owns `execFile` invocation, trimmed `stdout`/`stderr`, common `maxBuffer`, and consistent failure-message construction. 2. Add narrow `git`, `gh`, and `openspec` wrappers in `lib/cli-tools` so tool-specific behavior stays explicit, including `git -C <repo>`, `gh` cwd-based execution, and `OPENSPEC_TELEMETRY=0` for OpenSpec. 3. Update `lib/git/ops.ts`, `lib/team/git.ts`, and `lib/team/openspec.ts` to consume those wrappers without changing their exported APIs or higher-level workflow logic. 4. Decide deliberately whether `lib/team/git.test.ts` should reuse the new `git` wrapper or keep a thin local test convenience helper; either way, avoid leaving duplicated process-exec logic behind. 5. Add targeted regression coverage for the shared utility and any touched wrappers, then run `pnpm fmt`, `pnpm lint`, relevant Vitest coverage, and `pnpm build`. Scope boundaries: - No intended behavior change for git worktree management, GitHub CLI flows, or OpenSpec proposal materialization. - Do not refactor `spawn("codex", ...)` in `lib/agent/codex-cli.ts`; this request is limited to the duplicated `execFile`-based runners. - Do not broaden the abstraction into a generic process framework beyond what is needed for `git`, `gh`, and `openspec`. Risks and assumptions: - Failure messages from these helpers surface in operator workflows, so the refactor must preserve actionable command/context output. - The OpenSpec wrapper must keep telemetry disabled and preserve cwd-based execution. - Shared utility changes affect multiple server-side paths at once, so validation should cover both module-level tests and full build/lint checks. Approval note: This is one coherent proposal. Coding-review lanes stay idle until the proposal is approved.
