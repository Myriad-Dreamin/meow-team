## Context

This change captures proposal "Build typed `meow-prompt` loader library" as OpenSpec change `prompt-loader-a1-p1-build-typed-meow-prompt-loader-library`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Create `packages/meow-prompt` with markdown-template parsing, typed direct-import support, builtin raw pipes, requested initial tests, and AGENTS syntax documentation.
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

Planner deliverable reference: Proposal: `Build typed meow-prompt loader library` Suggested OpenSpec seed: `typed-prompt-loader-a1-p1-build-meow-prompt-library` Objective: Add an internal prompt-template package at `packages/meow-prompt` that supports named placeholder substitution with builtin pipes, generates typed exports from markdown template modules, and documents the syntax in `AGENTS.md`. Implementation shape: 1. Create the workspace/package scaffolding required for `packages/meow-prompt`, since the repository does not currently have a `packages/` workspace layout. 2. Build the core parser/render runtime around the requested grammar: `[[param:name]]`, `[[param:name|pipe]]`, and builtin `raw` variants including `raw('json')`, with no whitespace allowed in parameter or pipe identifiers. 3. Keep builtin pipe registration local to `packages/meow-prompt`; do not introduce custom/user-defined pipes in the first change. 4. Implement markdown template compilation that extracts frontmatter, discovers parameter names, and emits typed module exports: `prompt`, `frontmatter`, `type FrontMatter`, and `type Args`. 5. Support the request’s mixed suffix language by handling `.prompt.md` and `.template.md` consistently, preferably through one shared loader/compiler path. 6. Integrate the loader with Next.js, TypeScript, and Vitest so direct template imports work in app code and tests without ad hoc runtime file reads. 7. Add the requested initial tests only: no-parameter template, simple parameter substitution, raw substitution, and raw-with-argument substitution. 8. Update `AGENTS.md` to emphasize the syntax rules and the builtin-only pipe model. Expected implementation surfaces: - `packages/meow-prompt/**/*` - root `package.json` - `pnpm-workspace.yaml` - `next.config.ts` - `tsconfig.json` and/or a `*.d.ts` module declaration - `vitest.config.ts` - `AGENTS.md` Scope boundaries: - Do not migrate existing harness role prompts onto the new loader in this first pass. - Do not add a plugin API for user-defined pipes. - Do not broaden test coverage beyond the requested happy-path cases unless a small parser regression test is needed to stabilize the implementation. Assumptions and risks: - Treat the double-bracket syntax as canonical despite the single-bracket typos in the request. - Interpret the exported `prompt` function as returning a rendered string. - Assume YAML frontmatter unless approval feedback says otherwise. - Direct markdown-import support is the main integration risk and should be validated with `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Reference direction for the coder: Use the pi-mono prompt-template implementation as a design reference for separation of parsing and substitution responsibilities, not as a verbatim port: https://github.com/badlogic/pi-mono/blob/b98478560af69a1f83e3cf2f02f20f71136f6935/packages/coding-agent/src/core/prompt-templates.ts Coding-review lanes should stay idle until this proposal is explicitly approved.
