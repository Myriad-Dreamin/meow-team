## Context

This change captures proposal "Inject executor and schema-first team role modules" as OpenSpec change `inject-team-roles-a1-p1-inject-executor-and-schema-first-team-role-modul`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Extract the CLI executor plus request-title, planner, coder, and reviewer modules; wire them into `runTeam` and dispatch with production defaults; and add deterministic `runTeam` tests using mock executor and mock role functions.
- Preserve a reviewable OpenSpec contract before coding starts.
- Keep the proposal logical enough that any pooled worker can execute it.
- Reuse a managed worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` for cache-friendly execution.

**Non-Goals:**
- Bind this proposal to a specific branch or worker slot before approval.
- Expand scope beyond the approved proposal without human feedback.
- Merge sibling proposals into a single coding pass without replanning.

## Decisions

- Store the proposal as a dedicated OpenSpec change before coding begins.
- Let the pooled coding-review runtime allocate execution branches and worktrees after approval.
- Use planner output as the starting point for reviewer validation and follow-up tasks.
- Prefer incremental implementation that can be requeued after machine review feedback.

## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: OpenSpec-aligned proposal: `inject-team-roles` Objective: - Refactor the team orchestration so `runTeam` and downstream lane execution depend on injected executor/role modules instead of calling `runCodexStructuredOutput` directly. Implementation scope: - Add an executor abstraction and move the production Codex CLI implementation from `lib/team/codex-cli.ts` to `lib/team/agent/codex-cli.ts`. - Extract four schema-first role modules: request-title, planner, coder, and reviewer. Each module should define its input/output schemas first and then export a typed function that receives its input plus an executor. - Move the existing planner prompt assembly and planner response parsing out of `lib/team/network.ts` into `lib/team/roles/planner.ts`. - Replace `runRoleWithCodexCli` with dedicated `lib/team/roles/coder.ts` and `lib/team/roles/reviewer.ts` modules while preserving their current prompt differences and reviewer PR draft handling. - Update `runTeam` to accept the executor and role dependencies as arguments with production defaults, and thread the same dependency bundle into dispatch/lane execution so coder and reviewer runs use the injected implementations too. - Add `runTeam` tests with a mock executor and mock roles that return hardcoded outputs in a fixed sequence, asserting request-title/planner behavior, dispatch payload creation, and dependency-driven orchestration without invoking Codex CLI. Scope boundaries: - Do not change role prompt content. - Do not change dispatch scheduling semantics except where dependency injection must be threaded through existing entrypoints. - Keep persisted thread and assignment formats stable unless a small compatibility change is unavoidable. Assumptions and risks: - The requested “four roles” is interpreted as request-title, planner, coder, and reviewer, because those are the current structured-output call sites that need decoupling. - Background lane execution can start from approval and thread-refresh routes, so limiting injection to the initial `runTeam` call would leave coder/reviewer paths coupled to the default CLI implementation. Validation: - Add targeted Vitest coverage for `runTeam` using mocked dependencies. - Run `pnpm lint`. - Run `pnpm build` if exported module boundaries or route wiring change materially.
