# Paseo Installation for MeowFlow

MeowFlow uses Paseo for the daemon, app, and CLI runtime. Upstream Paseo
describes this runtime as three pieces: the daemon is the local server that
manages agents, the app is the mobile, web, or desktop client, and the CLI is
the terminal interface.[^paseo-docs]

## Modified Source Note

MeowFlow currently targets the modified Paseo source in this repository.
Prebuilt Paseo desktop releases and globally installed `@getpaseo/cli` releases
do not include the MeowFlow-specific Paseo changes yet. Use this source checkout
until the modified Paseo package is published separately.

## Prerequisites

Paseo manages existing agent CLIs, so install at least one agent and verify it
works with your credentials before starting Paseo:[^paseo-docs]

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://github.com/openai/codex)
- [OpenCode](https://github.com/anomalyco/opencode)

## Source Checkout Setup

From the repository root, install dependencies and build the local Paseo packages
before running `mfl` so the local CLI imports fresh `dist/*` output:

```bash
pnpm install --frozen-lockfile
pnpm run build:daemon
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for the local CLI and build sync notes. In
this checkout, use `pnpm run cli -- ...` for direct Paseo commands instead of a
globally installed `paseo`.

Start the dev daemon and app:

```bash
pnpm run dev
```

The dev script starts the daemon and Expo app together. It automatically derives
isolated `PASEO_HOME` state for worktrees.

[^paseo-docs]: [Paseo Getting Started](https://paseo.sh/docs)
    documents Paseo's daemon, app, CLI, and prerequisite agent setup.
