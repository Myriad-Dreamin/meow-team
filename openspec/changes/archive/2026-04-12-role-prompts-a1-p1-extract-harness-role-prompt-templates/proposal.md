## Why

Move the inline prompt construction in `lib/team/roles` into colocated `meow-prompt` markdown files, preserve the separate `prompts/roles` role definitions, and extend typed prompt-import support plus regression coverage so the new templates pass format, lint, test, typecheck, and build validation. Extract harness role prompt builders into colocated `meow-prompt` template files and wire typed template support through the existing role agents. This proposal is one candidate implementation for the request: Use `meow-prompt` to refactor ai prompt constructions. in `lib/team/roles/` split the prompts into `meow-prompt`'s markdown syntax into standalone file, e.g. `coder.ts` has `coder.prompt.md`.

## What Changes

- Introduce the `role-prompts-a1-p1-extract-harness-role-prompt-templates` OpenSpec change for proposal "Extract harness role prompt templates".
- Move the inline prompt construction in `lib/team/roles` into colocated `meow-prompt` markdown files, preserve the separate `prompts/roles` role definitions, and extend typed prompt-import support plus regression coverage so the new templates pass format, lint, test, typecheck, and build validation.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `role-prompts-a1-p1-extract-harness-role-prompt-templates`: Move the inline prompt construction in `lib/team/roles` into colocated `meow-prompt` markdown files, preserve the separate `prompts/roles` role definitions, and extend typed prompt-import support plus regression coverage so the new templates pass format, lint, test, typecheck, and build validation.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor(team/roles): Extract harness role prompt templates`
- Conventional title metadata: `refactor(team/roles)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Extract harness role prompt templates` Suggested OpenSpec seed: `extract-harness-role-prompt-templates` Objective: replace the handwritten string-array prompt builders in `lib/team/roles` with colocated `meow-prompt` markdown templates such as `coder.prompt.md`, while preserving harness behavior and typed prompt imports. Implementation shape: 1. Add colocated template files for each inline harness prompt in `lib/team/roles`, at minimum `planner.prompt.md`, `coder.prompt.md`, `reviewer.prompt.md`, and `request-title.prompt.md`. 2. Update the corresponding role modules to import those templates and pass precomputed state into `prompt(...)`, keeping helper logic such as `summarizeHandoffs`, conventional-title formatting, OpenSpec skill references, and archive-phase branching in TypeScript. 3. Keep `prompts/roles/*.md` unchanged as the separate role-system prompts loaded by `lib/team/prompts.ts`; this request should not collapse the two prompt layers together. 4. Extend `meow-prompt` typed import support so templates outside `app` and `docs`, especially under `lib/team/roles`, get declaration files during `pnpm meow-prompt:sync-types` and stay compatible with Next, Vitest, and TypeScript. 5. Add focused regression coverage for the extracted prompt layer, likely including the existing `request-title` prompt expectations and at least one role-agent assertion that important rendered sections still appear. 6. Run `pnpm fmt`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, and `pnpm build` before handoff. Scope boundaries: - Do not move or rewrite the human-authored role-definition markdown in `prompts/roles`. - Do not broaden this into new prompt semantics, custom pipes, or a generalized prompt registry. - Do not change planner/coder/reviewer workflow behavior except where template extraction requires import plumbing. Assumptions and risks: - The request is interpreted to cover every inline AI prompt builder under `lib/team/roles`, including `request-title.ts`, not only `planner/coder/reviewer`. - The largest technical risk is widening the current meow-prompt type-sync discovery, because the existing sync config is still scoped to `app` and optional `docs`. - Small whitespace/layout drift in the rendered prompts is acceptable only if tests confirm the critical instructions and context blocks are preserved. Approval note: this should materialize as a single OpenSpec change, and the shared coder/reviewer pool should stay idle until approval.
