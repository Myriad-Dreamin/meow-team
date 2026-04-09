# Harness Team

Harness Team is a Next.js project for running a small, continuously configured
engineering team with Codex CLI as the execution backend.

The default team follows a simple harness engineering workflow:

- `planner` turns a request into an execution plan.
- `coder` implements or proposes the concrete change.
- `reviewer` checks the work for bugs, regressions, and missing tests.

Role behavior lives in Markdown prompts under [`prompts/roles`](/home/kamiyoru/work/ts/meow-team/prompts/roles),
and the whole team is configured in one file:
[`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts).

## Why this shape

- It keeps one owner-controlled team configuration instead of scattering role
  behavior across the app.
- It runs planner, coder, and reviewer steps through Codex CLI with structured
  outputs instead of opaque in-process orchestration.
- It exposes repo-local skills to Codex CLI so the harness can teach role- and
  repository-specific workflows without custom tool code.
- It supports continuous work by persisting each thread's step history and
  current handoff state to local JSON storage.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Runtime Configuration

The app reads your Codex user settings by default instead of requiring a
project-local `.env.local` file:

- Model and base URL: `~/.codex/config.toml`
- Credentials: `~/.codex/auth.json`

With the current local setup, that means the team inherits the same OpenAI
compatible provider and model selection that your Codex CLI already uses.
Restart the dev server after changing your Codex config so the server reloads
those settings.

### Optional Environment Fallbacks

If you are running outside that Codex setup, the server still accepts these
environment variables:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.2-codex
TEAM_OWNER_NAME=Your Team
```

`OPENAI_MODEL` falls back to `gpt-5.2-codex` when neither the Codex config nor
the environment provides a model override.

## Project Layout

- [`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts):
  single source of truth for the team owner, workflow, storage, model, and
  allowed local repository directories.
- [`prompts/roles`](/home/kamiyoru/work/ts/meow-team/prompts/roles):
  Markdown system prompts for each role.
- [`lib/team/network.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/network.ts):
  planner orchestration and thread state management.
- [`lib/team/codex-cli.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/codex-cli.ts):
  structured Codex CLI execution helpers plus temporary skill exposure.
- [`lib/team/history.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/history.ts):
  persistent thread storage for continuous runs.
- [`lib/team/repositories.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/repositories.ts):
  safe server-side repository discovery limited to configured directories.
- [`app/api/team/run/route.ts`](/home/kamiyoru/work/ts/meow-team/app/api/team/run/route.ts):
  API endpoint that runs the team for a prompt and returns the handoffs.

## Scoped Local Repositories

You can expose local repositories to the UI by listing allowed directories in
[`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts):

```ts
import path from "node:path";

defineTeamConfig({
  // ...
  repositories: {
    roots: [
      {
        id: "local-workspace",
        label: "Local Workspace",
        directory: path.resolve(process.cwd(), ".."),
      },
    ],
  },
});
```

The app scans each configured directory itself plus its direct child
directories for a `.git` entry. Only repositories discovered inside those
configured directories appear in the selector, and the API revalidates the
selection on every run.

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
  If it contains unrelated secrets from the copied app, rotate them and remove
  them from this project.
