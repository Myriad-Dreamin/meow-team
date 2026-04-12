# Agent Rules

- Always read and follow `INSTRUCTIONS.md` before planning or changing code.
- If repository documents conflict, prioritize `INSTRUCTIONS.md`.
- Keep all non-i18n project text in English.
- Use `pnpm` for dependency and script management.

## Harness Project Rules

- The engineering team is defined by [`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts).
- Build and evolve agent behavior through Codex CLI runs, repo-local skills, and explicit application orchestration.
- Keep role system prompts in Markdown under [`lib/team/roles`](/home/kamiyoru/work/ts/meow-team/lib/team/roles).
- The default workflow is `planner -> coder -> reviewer`.
- Extra roles are supported by adding a `*.prompt.md` file under [`lib/team/roles`](/home/kamiyoru/work/ts/meow-team/lib/team/roles), wiring the matching role module into the harness, running `pnpm meow-prompt:sync-types`, and then referencing its role ID in [`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts).
- Use the OpenAI backend for model configuration, with Codex as the default coding model.
- Prefer deterministic routing and explicit handoff state over hidden prompt-only coordination.
- Keep continuous-run persistence inside [`lib/team/history.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/history.ts).

## Validation

- Keep repository formatting aligned with `prettier.config.cjs`.
- Run `pnpm fmt` after editing files that Prettier manages.
- CI runs `pnpm fmt:check` and should stay green before you finish.
- Run `pnpm lint` after meaningful code changes.
- Run `pnpm build` before finishing structural or integration work when feasible.

## Prompt Template Syntax

- `meow-prompt` templates use double-bracket placeholders only: `[[param:name]]`.
- Pipes stay builtin-only in `packages/meow-prompt`; custom pipe registration is out of scope for this repository.
- Supported builtin raw forms are `[[param:name|raw]]` and `[[param:name|raw('json')]]`.
- Keep parameter and pipe identifiers whitespace-free. Use `name|raw('json')`, not spaced variants such as `name | raw`.
