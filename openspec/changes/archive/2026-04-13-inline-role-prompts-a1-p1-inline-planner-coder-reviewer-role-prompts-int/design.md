## Context

This change captures proposal "Inline planner/coder/reviewer role prompts into `lib/team/roles`" as OpenSpec change `inline-role-prompts-a1-p1-inline-planner-coder-reviewer-role-prompts-int`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Consolidate the role system instructions into the existing `lib/team/roles/*.prompt.md` templates, remove the duplicate `prompts/roles` registry/loading path, and update metadata, docs, and validation so the harness keeps the same workflow behavior with a single prompt source.
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
- Keep the canonical request/PR title as `refactor(team/roles): Inline planner/coder/reviewer role prompts into`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor(team/roles)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor(team/roles): Inline planner/coder/reviewer role prompts into`
- Conventional title metadata: `refactor(team/roles)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal: `Inline role prompts statically` Suggested OpenSpec seed: `inline-role-prompts` Objective: Collapse the duplicated planner/coder/reviewer prompt layers by moving the system-role instructions into `lib/team/roles/*.prompt.md`, removing the separate `prompts/roles` registry/loading path, and updating docs/tests/tooling so the harness keeps the same behavior. Implementation shape: 1. Merge the current role instruction text from `prompts/roles/{planner,coder,reviewer}.prompt.md` into the matching `lib/team/roles/*.prompt.md` templates, add any needed frontmatter or metadata there, and remove the `rolePrompt` placeholder from the rendered planner/lane prompts. 2. Refactor `lib/team/roles/{planner,coder,reviewer}.ts`, `lib/team/network.ts`, and `lib/team/agent-helpers.ts` so role IDs, names, and prompt metadata come from the consolidated role modules instead of `lib/team/prompts.ts` and `loadRolePrompt(...)`. 3. Remove obsolete prompt-registry code and tests under `prompts/roles` and `lib/team/prompts*`, leaving one prompt-authoring source for the runtime roles. 4. Update `INSTRUCTIONS.md`, `AGENTS.md`, `README.md`, and roadmap docs because the current repository guidance explicitly says role prompts live in `prompts/roles`; approval for this proposal should be treated as approval to change that rule. 5. Rerun `pnpm meow-prompt:sync-types`, `pnpm fmt`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, and `pnpm build`. Scope boundaries: - Do not change planner -> coder -> reviewer workflow behavior beyond the plumbing needed to remove the extra prompt layer. - Do not add new prompt syntax, custom pipes, or a generalized prompt-management system. - Leave `request-title` behavior alone except for any shared helper cleanup required by the refactor. Assumptions and risks: - In the current tree, `prompts/roles` are already statically imported through `prompts/roles/index.ts`; the real change is consolidating prompt ownership, not re-fixing active filesystem reads. - Archived prompt work and current docs intentionally preserve a two-layer design, so this request is a design reversal and the coder should update those references rather than follow them. - The main regression risk is losing role metadata or critical instruction text when removing `RolePrompt` objects, so prompt-rendering and handoff tests should pin the important sections. Approval note: materialize this as one OpenSpec change and keep the coder/reviewer pool idle until the owner approves it.
