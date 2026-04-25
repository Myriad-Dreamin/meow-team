# MeowFlow

`mfl` is the MeowFlow CLI shortcut. It starts Paseo agents for the current
working directory without a MeowFlow config file.

## Installation

Install the CLI:

```bash
npm install -g meow-flow
```

When working from this repository, run the same CLI through the workspace
script:

```bash
pnpm run cli:mfl -- run "Create a echo hello script."
```

## Get Started

```text
mfl run "Create a echo hello script."
// You'll see the agent started in the paseo's webapp
```

`mfl run` passes the request body through to `paseo run` unchanged and launches
the agent in the current working directory.

## Run

```bash
mfl run "implement user authentication"
mfl run --id auth-flow "implement user authentication and add tests"
```

When `--id` is omitted, `mfl` generates a UUID and uses it as the MeowFlow
thread id. The resolved id is sent to Paseo as a label:

```text
x-meow-flow-id=<thread-id>
```

The command does not install, read, or require a MeowFlow config file.
