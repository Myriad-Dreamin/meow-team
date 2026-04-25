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

### Desktop app (recommended)

Download it from the [GitHub releases page](https://github.com/getpaseo/paseo/releases). The `paseo.sh/download` page is currently unavailable and will be restored in the future. Open the app and the daemon starts automatically. Nothing else to install.

To connect from your phone, scan the QR code shown in Settings.

### CLI / headless

Install the Paseo CLI and start Paseo:

```bash
npm install -g @getpaseo/cli
paseo
```

This shows a QR code in the terminal. Connect from any client. This path is useful for servers and remote machines.

Install the MeowFlow CLI:

```bash
npm install -g meow-flow
```

For full Paseo setup, see:

- [Docs](https://paseo.sh/docs)

## Get Started

```text
mfl run "Create a echo hello script."
// You'll see the agent started in the paseo's webapp
```

`mfl run` launches a Paseo agent from the current working directory and passes the request through unchanged.

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
mfl run "implement user authentication"
mfl run --id auth-flow "implement user authentication and add tests"
```

Paseo's CLI remains available for direct agent management:

```bash
paseo ls                           # list running agents
paseo attach abc123                # stream live output
paseo send abc123 "also add tests" # follow-up task

# run on a remote daemon
paseo --host workstation.local:6767 run "run the full test suite"
```

See the [full CLI reference](https://paseo.sh/docs/cli) for more.

## How To Use

For the current `MeowFlow` workflow and usage guidance, see [issue #93](https://github.com/Myriad-Dreamin/meow-team/issues/93).

## Acknowledgement

`MeowFlow` builds on [Paseo][paseo] and [OpenSpec][openspec]. Paseo provides the agent runtime and orchestration surface, while OpenSpec provides the roadmap, spec, and task-oriented structure that this workflow relies on.

[paseo]: https://paseo.sh
[openspec]: https://openspec.dev
