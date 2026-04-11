## Context

This change captures proposal "Simplify meow-prompt build pipeline and YAML frontmatter" as OpenSpec change `meow-prompt-build-a1-p1-simplify-meow-prompt-build-pipeline-and-yaml-fro`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Remove webpack-only support and the standalone template-sync CLI, generate prompt declaration files from the Vite lifecycle, replace custom frontmatter parsing with `stripYamlFrontmatter` plus `js-yaml`, and update configs/tests so typed prompt imports still work across Next, Vitest, and TypeScript.
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

Planner deliverable reference: Create one OpenSpec change seeded as `simplify-meow-prompt-build-and-frontmatter`. Execution intent: - Remove webpack-only build and loader paths from `meow-prompt` and the repo scripts that still force webpack. - Fold prompt declaration syncing into the Vite plugin lifecycle so the separate `sync-template-types` implementation and script can be removed. - Replace custom frontmatter parsing with the requested `stripYamlFrontmatter` behavior and parse the extracted YAML via `js-yaml`. - Update tests, fixtures, and config so typed prompt imports continue to work in the app, Vitest, and TypeScript validation flows. Approval-sensitive points: - The coder should treat preserving typed imports outside pure Vite builds as a hard requirement. - If removing webpack support would also require changing current Next/Turbopack prompt loading semantics, that should be surfaced during implementation rather than expanded implicitly. - Coding and review lanes remain idle until human approval arrives.
