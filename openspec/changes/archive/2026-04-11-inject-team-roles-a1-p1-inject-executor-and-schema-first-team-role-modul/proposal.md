## Why

Extract the CLI executor plus request-title, planner, coder, and reviewer modules; wire them into `runTeam` and dispatch with production defaults; and add deterministic `runTeam` tests using mock executor and mock role functions. Inject the Codex executor and role wrappers into the team run flow. This proposal is one candidate implementation for the request: There are multiple functions depending on `runCodexStructuredOutput`, we would like to refactor this. - executor: `codex-cli.ts` -> `lib/team/agent/codex-cli.ts` - role1: part of code about `planner` in runTeam -> `lib/team/roles/planner.ts` - role2 and role3: runRoleWithCodexCli -> `roles/coder.ts`, `lib/team/roles/reviewer.ts` - update `runTeam` in network to accept executor and these four roles as arguments. - test `runTeam` with mock executor and mock roles. Roles could be as simple as functions that return hardcoded exactly with a sequence of calls and outputs. Each role should share same code arrangement style, like first define schemes in the file, then have function with arguments and resultant like "input scheme", "output scheme", "executor".

## What Changes

- Introduce the `inject-team-roles-a1-p1-inject-executor-and-schema-first-team-role-modul` OpenSpec change for proposal "Inject executor and schema-first team role modules".
- Extract the CLI executor plus request-title, planner, coder, and reviewer modules; wire them into `runTeam` and dispatch with production defaults; and add deterministic `runTeam` tests using mock executor and mock role functions.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `inject-team-roles-a1-p1-inject-executor-and-schema-first-team-role-modul`: Extract the CLI executor plus request-title, planner, coder, and reviewer modules; wire them into `runTeam` and dispatch with production defaults; and add deterministic `runTeam` tests using mock executor and mock role functions.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: OpenSpec-aligned proposal: `inject-team-roles` Objective: - Refactor the team orchestration so `runTeam` and downstream lane execution depend on injected executor/role modules instead of calling `runCodexStructuredOutput` directly. Implementation scope: - Add an executor abstraction and move the production Codex CLI implementation from `lib/team/codex-cli.ts` to `lib/team/agent/codex-cli.ts`. - Extract four schema-first role modules: request-title, planner, coder, and reviewer. Each module should define its input/output schemas first and then export a typed function that receives its input plus an executor. - Move the existing planner prompt assembly and planner response parsing out of `lib/team/network.ts` into `lib/team/roles/planner.ts`. - Replace `runRoleWithCodexCli` with dedicated `lib/team/roles/coder.ts` and `lib/team/roles/reviewer.ts` modules while preserving their current prompt differences and reviewer PR draft handling. - Update `runTeam` to accept the executor and role dependencies as arguments with production defaults, and thread the same dependency bundle into dispatch/lane execution so coder and reviewer runs use the injected implementations too. - Add `runTeam` tests with a mock executor and mock roles that return hardcoded outputs in a fixed sequence, asserting request-title/planner behavior, dispatch payload creation, and dependency-driven orchestration without invoking Codex CLI. Scope boundaries: - Do not change role prompt content. - Do not change dispatch scheduling semantics except where dependency injection must be threaded through existing entrypoints. - Keep persisted thread and assignment formats stable unless a small compatibility change is unavoidable. Assumptions and risks: - The requested “four roles” is interpreted as request-title, planner, coder, and reviewer, because those are the current structured-output call sites that need decoupling. - Background lane execution can start from approval and thread-refresh routes, so limiting injection to the initial `runTeam` call would leave coder/reviewer paths coupled to the default CLI implementation. Validation: - Add targeted Vitest coverage for `runTeam` using mocked dependencies. - Run `pnpm lint`. - Run `pnpm build` if exported module boundaries or route wiring change materially.
