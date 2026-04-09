# Harness Team

Harness Team is a fresh Next.js + AgentKit project for running a small,
continuously configured engineering team with Codex as the LLM backend.

The default team follows a simple harness engineering workflow:

- `planner` turns a request into an execution plan.
- `coder` implements or proposes the concrete change.
- `reviewer` checks the work for bugs, regressions, and missing tests.

Role behavior lives in Markdown prompts under [`prompts/roles`](/home/kamiyoru/work/ts/meow-team/prompts/roles),
and the whole team is configured in one file:
[`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts).

## Why this shape

- It follows AgentKit's example patterns around `createAgent`,
  `createTool`, `createNetwork`, and deterministic code-based routing.
- It keeps one owner-controlled team configuration instead of scattering
  agent definitions across the app.
- It supports continuous work by persisting each thread's AgentKit history
  and current handoff state to local JSON storage.

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

## Environment

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.2-codex
TEAM_OWNER_NAME=Your Team
```

`OPENAI_MODEL` defaults to `gpt-5.2-codex`, which OpenAI currently
recommends for agentic coding tasks in Codex-like environments.

## Project Layout

- [`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts):
  single source of truth for the team owner, workflow, storage, and model.
- [`prompts/roles`](/home/kamiyoru/work/ts/meow-team/prompts/roles):
  Markdown system prompts for each role.
- [`lib/team/network.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/network.ts):
  AgentKit network creation, routing, and state.
- [`lib/team/history.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/history.ts):
  persistent thread storage for continuous runs.
- [`app/api/team/run/route.ts`](/home/kamiyoru/work/ts/meow-team/app/api/team/run/route.ts):
  API endpoint that runs the team for a prompt and returns the handoffs.

## Adding a Role

1. Create a new Markdown prompt file in
   [`prompts/roles`](/home/kamiyoru/work/ts/meow-team/prompts/roles), for example
   `researcher.md`.
2. Add the role ID to the `workflow` array in
   [`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts).
3. Restart the dev server if you want the homepage metadata to refresh immediately.

The app resolves role titles from the first Markdown heading, so adding a new
role stays lightweight.

## Scripts

- `pnpm dev` starts the Next.js app.
- `pnpm build` builds the production app.
- `pnpm start` runs the production server.
- `pnpm lint` runs ESLint.
- `pnpm typecheck` runs TypeScript without emitting files.
- `pnpm format` formats the repo with Prettier.
- `pnpm format:check` checks formatting.

## Notes

- Thread history is stored locally in `data/team-threads.json`.
- A legacy `.env` from the previous copied project may still exist locally.
  If it contains an old GitHub token, rotate it and replace it with this
  project's OpenAI-focused env setup.
