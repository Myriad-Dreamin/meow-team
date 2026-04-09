# Agent Rules

- Always read and follow `INSTRUCTIONS.md` before planning or changing code.
- If repository documents conflict, prioritize `INSTRUCTIONS.md`.
- Keep all non-i18n project text in English.
- Use `pnpm` for dependency and script management.

## AgentKit Project Rules

- The engineering team is defined by [`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts).
- Build and evolve agent behavior through AgentKit primitives, not custom ad-hoc orchestration.
- Keep role system prompts in Markdown under [`prompts/roles`](/home/kamiyoru/work/ts/meow-team/prompts/roles).
- The default workflow is `planner -> coder -> reviewer`.
- Extra roles are supported by adding a Markdown file and then referencing its role ID in `team.config.ts`.
- Use the OpenAI backend for model configuration, with Codex as the default coding model.
- Prefer deterministic routing and explicit handoff state over hidden prompt-only coordination.
- Keep continuous-run persistence inside [`lib/team/history.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/history.ts).

## Validation

- Run `pnpm lint` after meaningful code changes.
- Run `pnpm build` before finishing structural or integration work when feasible.
