## Context

This change captures proposal "Remove Turbopack and Direct Vite Loading" as OpenSpec change `meow-prompt-vite-a1-p1-remove-turbopack-and-direct-vite-loading`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Delete the Turbopack-specific `meow-prompt` integration, replace `walkDirectory`-based declaration syncing with Vite-managed loading for `app` and optional `docs`, and update tests/config so supported prompt imports remain typed under the new flow.
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

Planner deliverable reference: Proposal: `Remove Turbopack and Direct Vite Loading` Execution intent - Remove the Turbopack-specific loader and Next config path. - Replace `walkDirectory`-based declaration syncing with a Vite-managed bootstrap/load flow limited to `app/**` and `docs/**` so prompt/template files are transformed by `meow-prompt` directly. - Rework tests and typing checks to validate the new supported flow. Implementation notes for the coder - Focus first on `next.config.ts`, `package.json`, `packages/meow-prompt/src/declaration-sync.ts`, and `packages/meow-prompt/src/vite-plugin.ts`. - Preserve `meow-prompt`'s typed import guarantees for the supported roots, but do not preserve arbitrary repo-wide scanning. - A virtual entry/import strategy or another Vite-managed loading mechanism is acceptable, but reintroducing custom recursive walking is out of scope. - Update or replace the current typecheck regression that depends on `syncMeowPromptDeclarationsForNext()` so it exercises the approved Vite path instead. Risks to resolve during implementation - Validate how the Next app continues to execute `app/*.prompt.md` imports after Turbopack support is removed. - Ensure missing `docs/` does not fail either declaration generation or tests. - Make Vite dependency ownership explicit if repo code imports Vite directly. Approval gate - Do not schedule coder/reviewer work until the owner approves this proposal.
