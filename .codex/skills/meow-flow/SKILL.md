---
name: meow-flow
description: Use when the user starts an interactive-mode request with `/meow-flow` or `/mfl`; coordinate staged MeowFlow agents through mfl thread state, thread updates, mfl-run stage launches, and handoffs.
---

Coordinate MeowFlow staged agent work through the `mfl` CLI.

## Hard Rules

- Do not use chat history as the source of truth for thread state. Discover and
  update MeowFlow state with `mfl` before acting.
- If a slash command arrives in the middle of an existing Paseo agent chat, this
  chat is coordinator-mode unless `mfl agent update-self` confirms it is already
  the requested MeowFlow stage agent for the current thread.
- In coordinator-mode, do not perform plan/code/review/execute/validate work
  locally. Launch the requested stage with `mfl run --stage <stage> ...`, report
  the returned ids, and stop.
- If `mfl agent update-self` cannot classify this session as a MeowFlow stage
  agent, stay in coordinator-mode and use `mfl run` for the requested stage.

## Command Contract

- Syntax: `/meow-flow [--provider <provider>] [content]` or
  `/mfl [--provider <provider>] [content]`.
- Continuation syntax: `/mfl plan [--provider <provider>]`,
  `/mfl code [--provider <provider>]`,
  `/mfl review [--provider <provider>]`,
  `/mfl execute [--provider <provider>]`,
  `/mfl validate [--provider <provider>]`, `/mfl commit`, `/mfl archive`,
  and `/mfl delete`.
- The current thread state, worktree occupation, agents, request body, and
  handoffs come from `mfl`, not from chat history alone.
- Thread names set with `mfl thread set name` must be kebab-case matching
  `^[a-z0-9]+(-[a-z0-9]+)*$`.
- Agent names from `mfl run` are `<Stage>: <request summary>` until the thread
  has a name, then `<Stage>: <thread-name> (<agent-sequence>)`. If a stage
  agent changes the thread name, update the current idle or running Paseo agent
  with `paseo agent update <agent-id> --name "<Stage>: <thread-name> (<sequence>)"`.

## Startup

1. If running inside a Paseo agent, run `mfl agent update-self`.
2. Run `mfl status`.
3. If status is `repository-root`, tell the user to create a linked worktree
   with `mfl worktree new` and stop.
4. If status is `idle` and the user provided request content, launch the first
   plan agent. When the entry command includes `--provider <provider>`, pass it
   to `mfl run`; otherwise rely on `mfl run` provider resolution:

   ```bash
   mfl run --stage plan "<content>"
   mfl run --stage plan --provider <provider> "<content>"
   ```

5. If status is `occupied`, report the thread name or id and latest agent id,
   then:
   - For `/mfl plan`, `/mfl code`, `/mfl review`, `/mfl execute`, or
     `/mfl validate`, launch the matching stage with `mfl run`.
   - For `/meow-flow`, `/mfl`, or `/meow-plan` with request content and no
     explicit continuation stage, launch a plan stage in the current thread
     with `mfl run --stage plan ...`.
   - If there is no request content or the user asks for a different thread,
     ask how they want to proceed before launching anything.

When `mfl run` returns `agent-id: <id>` and `next-seq: <seq>`, include both in
your response. Also include `thread-id` and `worktree` when `mfl run` prints
them, then direct the user to continue in the new agent chat.

## Session Mode

After startup, decide whether this chat is a coordinator or a stage agent:

- Coordinator-mode: any normal Paseo agent chat, any `mfl agent update-self`
  failure, or any chat that is not confirmed as the requested stage. Launch with
  `mfl run --stage <stage> ...` and do not perform the stage work locally.
- Stage-agent mode: `mfl agent update-self` confirms this session belongs to
  the current thread and requested stage. Before acting, read:

  ```bash
  mfl status
  mfl thread status <id> --no-color
  mfl handoff get -n 5
  ```

## Stage Dispatch

For staged continuation commands, run the matching stage through `mfl run` in
the current thread worktree. Pass `--provider <provider>` when the user
included it; otherwise rely on `mfl run` provider resolution:

```bash
mfl run --stage plan "<optional-content>"
mfl run --stage code "<optional-content>"
mfl run --stage review "<optional-content>"
mfl run --stage execute "<optional-content>"
mfl run --stage validate "<optional-content>"

mfl run --stage code --provider <provider> "<optional-content>"
```

The launched stage agent reads `mfl thread status <id> --no-color` and recent
handoffs before acting. The coordinator stops after reporting the launched
agent details.

## Handoffs

Stage agents should read recent handoffs with:

```bash
mfl handoff get -n 5
mfl handoff get --since <seq>
```

Before finishing, agents that produce planning, implementation, review,
execution, or validation results append a compact handoff:

```bash
mfl handoff append --stage plan "planned X; proposal Y; next code"
mfl handoff append --stage code "implemented X; tests Y passed"
mfl handoff append --stage review "approved; checked A and B"
mfl handoff append --stage execute "generated script X; output at Y"
mfl handoff append --stage validate "validated X with command Y"
```

Keep handoffs short and concrete. They are coordination state for later agents.

## Continuation Actions

- `/mfl commit`: read new handoffs, inspect the current diff, commit with a
  suitable repository title, and push when a remote tracking branch is
  configured.
- `/mfl archive`: follow the same behavior as `/meow-archive`.
- `/mfl delete`: follow the same behavior as `/meow-archive delete`; do not
  revert code changes.

## Output

For launches, report:

- the stage launched
- `thread-id`
- `worktree`
- `provider`
- `agent-id`
- `next-seq`
- the next chat or command the user should use
