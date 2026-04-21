# Harness Team

Harness Team is a Next.js project for running a small, continuously configured
engineering team with Codex CLI as the execution backend.

The default team follows a simple harness engineering workflow:

- `planner` turns a request into an execution plan.
- `coder` implements or proposes the concrete change.
- `reviewer` checks the work for bugs, regressions, and missing tests.

Requests prefixed with `\execution`, `\benchmark`, or `\experiment` stay on the
same planner entrypoint, but approved proposals route through execute-mode
lanes with `executor` and `execution-reviewer` roles while the existing
unprefixed coder/reviewer flow stays unchanged.

Role behavior lives in statically imported Markdown prompt modules under
[`lib/team/roles`](/home/kamiyoru/work/ts/meow-team/lib/team/roles), and the
whole team is configured in one file:
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

Android setup and APK build notes live in
[`docs/android.md`](/home/kamiyoru/work/ts/meow-team/docs/android.md).

## Runtime Configuration

The app reads your Codex user settings by default instead of requiring a
project-local `.env.local` file:

- Model and base URL: `~/.codex/config.toml`
- Credentials: `~/.codex/auth.json`

With the current local setup, that means the team inherits the same OpenAI
compatible provider and model selection that your Codex CLI already uses.
Restart the dev server after changing your Codex config so the server reloads
those settings. The backend now requires `~/.codex/auth.json` for credentials.

### Optional Environment Overrides

The backend still accepts these optional overrides for model selection and the
displayed team owner name:

```bash
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.2-codex
TEAM_OWNER_NAME=Your Team
```

`OPENAI_MODEL` falls back to `gpt-5.2-codex` when neither
`~/.codex/config.toml` nor the environment provides a model override.

## Project Layout

- [`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts):
  single source of truth for the team owner, workflow, storage, model, and
  allowed local repository directories.
- [`lib/team/roles`](/home/kamiyoru/work/ts/meow-team/lib/team/roles):
  colocated role agents plus the `*.prompt.md` templates that carry both role
  metadata and runtime prompt text.
- [`lib/team/coding/index.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/coding/index.ts):
  stage-oriented planner orchestration, dispatch approvals, and thread state management.
- [`lib/agent/codex-cli.ts`](/home/kamiyoru/work/ts/meow-team/lib/agent/codex-cli.ts):
  structured Codex CLI execution helpers plus temporary skill exposure.
- [`lib/team/history.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/history.ts):
  persistent thread storage for continuous runs.
- [`lib/team/repositories.ts`](/home/kamiyoru/work/ts/meow-team/lib/team/repositories.ts):
  safe server-side repository discovery limited to configured directories.
- [`editors/vscode`](/home/kamiyoru/work/ts/meow-team/editors/vscode):
  VS Code extension package bundled with esbuild to `out/extension.js` and
  packaged locally as a VSIX.
- [`projects/meow-team-apk`](/home/kamiyoru/work/ts/meow-team/projects/meow-team-apk):
  Android shell that hosts the workspace in a WebView, polls the backend
  notification snapshot, and packages directly as an APK without an NDK step.
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

## Notification Routing

`team.config.ts` owns the attention-notification target:

- Set `notifications.target` to `"browser"` to keep approval and failure alerts
  in the web UI.
- Set `notifications.target` to `"vscode"` to route those alerts through the
  VS Code extension and keep the browser silent.
- Set `notifications.target` to `"android"` to route those alerts through the
  Android app and keep the browser plus VS Code extension silent.

## Adding a Role

1. Create a new Markdown prompt file in
   [`lib/team/roles`](/home/kamiyoru/work/ts/meow-team/lib/team/roles), for example
   `researcher.prompt.md`, with `title` and `summary` frontmatter.
2. Add or update the matching role module in
   [`lib/team/roles`](/home/kamiyoru/work/ts/meow-team/lib/team/roles) and wire it into the harness dependencies or routing where needed.
3. Run `pnpm meow-prompt:sync-types` so TypeScript picks up the generated prompt declaration.
4. Add the role ID to the `workflow` array in
   [`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts).
5. Restart the dev server if you want the homepage metadata to refresh immediately.

Each role module now reads the role title and summary directly from the
colocated prompt frontmatter, with the Markdown body kept as the actual system
prompt text.

## Scripts

- `pnpm dev` starts the Next.js app.
- `pnpm build` builds the production app.
- `pnpm start` runs the production server.
- `pnpm android:install-deps` installs repo-local Android SDK, JDK 17, and Gradle dependencies under `build/deps`.
- `pnpm android:doctor` checks Java 17+, Android SDK discovery, and Gradle availability.
- `pnpm android:assemble` builds the Android debug APK.
- `pnpm android:install` installs the Android debug APK to a connected device or emulator.
- `pnpm lint` runs ESLint.
- `pnpm meow-prompt:sync-types` refreshes generated prompt declarations.
- `pnpm typecheck` runs TypeScript without emitting files.
- `pnpm fmt` formats the repo with Prettier.
- `pnpm fmt:check` checks formatting.
- `pnpm format` and `pnpm format:check` remain available as compatibility aliases.

## Notes

- Thread history is stored locally in `data/meow-team.sqlite`.
- Existing `data/team-threads.json` stores are imported on first access. See
  `docs/storage.md` for the migration and runtime details.
- A legacy `.env` from the previous copied project may still exist locally.
  If it contains unrelated secrets from the copied app, rotate them and remove
  them from this project.
