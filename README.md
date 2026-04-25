# MeowFlow

`MeowFlow` is a workflow for automated coding rather than vibe coding.

This project is based on [Paseo][paseo] and [OpenSpec][openspec]. Paseo provides the agent runtime, interfaces, and orchestration surface. OpenSpec provides the roadmap, specification, and task-driven structure that guides the workflow.

## Installation

Today, `MeowFlow` uses the Paseo daemon and clients for runtime.

Paseo runs a local server called the daemon that manages your coding agents. Clients like the desktop app, mobile app, web app, and CLI connect to it.

### Prerequisites

You need at least one agent CLI installed and configured with your credentials:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://github.com/openai/codex)
- [OpenCode](https://github.com/anomalyco/opencode)

### Source checkout

MeowFlow currently uses the modified Paseo source in this repository. Build the
local Paseo packages before running `mfl` so the local CLI imports fresh
`dist/*` output:

```bash
pnpm install --frozen-lockfile
pnpm run build:daemon
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the local CLI and build sync
notes. In particular, use `pnpm run cli -- ...` for Paseo commands from this
checkout instead of a globally installed `paseo`.

Start the dev daemon and app:

```bash
pnpm run dev
```

The dev script starts the daemon and Expo app together. It automatically derives
isolated `PASEO_HOME` state for worktrees.

### Desktop app

Prebuilt Paseo desktop releases do not include the MeowFlow-specific Paseo
changes yet. Use the source checkout path above until the modified Paseo package
is published.

For full Paseo setup, see:

- [Docs](https://paseo.sh/docs)

## Get Started

```text
pnpm run cli:mfl -- worktree new
pnpm run cli:mfl -- run "Create a echo hello script."
// You'll see the agent started in the paseo's webapp
```

Once the package is installed on `PATH`, the run command is:
`mfl run "Create a echo hello script."`.

`mfl run` launches a Paseo agent in a linked git worktree and passes the request
through unchanged. When no linked worktree is available, it tells you to run
`mfl worktree new`.

## Philosophy

`MeowFlow` follows a staged workflow:

1. Research / Explore stage: start by understanding the problem space and deciding what should exist before trying to build it. At this stage, you either write a roadmap to define direction and milestones, or write specs directly when the target is already clear enough.
2. Planning stage: split roadmap items into concrete specs and keep those specs updated as the work becomes better understood. The goal of planning is to turn broad intent into scoped, actionable tasks that can guide implementation without ambiguity.
3. Coding stage: implement according to the tasks defined in the specs instead of treating coding as an open-ended prompt. This keeps execution aligned with explicit requirements and makes progress easier to track.
4. Reviewing stage: test and debug according to the specs so review feedback stays actionable and tied to expected behavior. Review is not just opinion; it is validation against written requirements and a way to surface concrete gaps.
5. Execute mode: use the variant workflow described below when the work centers on producing scripts, artifacts, and datasets that need repeatable execution and validation.

## Execute Mode

Execute mode is a variant of the Plan-Code-Review workflow with an additional `meow-dataset` concept:

`meow-dataset` refers to repository-local dataset packages and their generated data locations. In practice, a dataset lives under `project/dataset/<dataset-name>/`, keeps generation scripts in `src/gen/`, validation scripts in `src/validate/`, and writes execution logs under `dataset.tmp/logs/`.

1. Planning stage: same as the standard workflow.
2. Execute stage: write scripts to generate, execute, benchmark, or debug project artifacts through these dataset packages, producing repeatable outputs instead of ad hoc files.
3. Validate stage: validate the scripts' output with dataset validators, and make future execution run those validators so datasets continue to satisfy their required format and quality constraints.

## Usage

Start a MeowFlow agent with `mfl run`:

```bash
mfl worktree new
mfl run "implement user authentication"
mfl run --id auth-flow "implement user authentication and add tests"
```

MeowFlow discovers workspaces with `git worktree list --porcelain`. You can
create worktrees with MeowFlow or with plain `git worktree add`; either way,
`mfl run` can use them.

Worktree helpers:

```bash
mfl worktree new                    # creates .paseo-workspaces/paseo-{N+1}
mfl worktree new --branch auth-flow # use a specific branch name
mfl worktree ls                     # alias: mfl worktree list
mfl worktree rm paseo-1             # alias: mfl worktree remove paseo-1
```

Paseo's CLI remains available for direct agent management:

```bash
pnpm run cli -- ls                           # list running agents
pnpm run cli -- attach abc123                # stream live output
pnpm run cli -- send abc123 "also add tests" # follow-up task

# run on a remote daemon
pnpm run cli -- --host workstation.local:6767 run "run the full test suite"
```

See the [full CLI reference](https://paseo.sh/docs/cli) for more.

## How To Use

For the current `MeowFlow` workflow and usage guidance, see [issue #93](https://github.com/Myriad-Dreamin/meow-team/issues/93).

## Acknowledgement

`MeowFlow` builds on [Paseo][paseo] and [OpenSpec][openspec]. Paseo provides the agent runtime and orchestration surface, while OpenSpec provides the roadmap, spec, and task-oriented structure that this workflow relies on.

[paseo]: https://paseo.sh
[openspec]: https://openspec.dev
