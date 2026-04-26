---
name: meow-flow
description: Use when the user starts an interactive-mode request with `/meow-flow` or `/mfl`; coordinate staged MeowFlow agents through mfl thread state and handoffs.
---

Coordinate MeowFlow staged agent work through the `mfl` CLI.

## Command Contract

- Syntax: `/meow-flow [content]` or `/mfl [content]`.
- Continuation syntax: `/mfl plan`, `/mfl code`, `/mfl review`,
  `/mfl execute`, `/mfl validate`, `/mfl commit`, `/mfl archive`, and
  `/mfl delete`.
- The current thread state, worktree occupation, agents, request body, and
  handoffs come from `mfl`, not from chat history alone.
- Thread names set with `mfl thread set name` must be kebab-case matching
  `^[a-z0-9]+(-[a-z0-9]+)*$`.

## Startup

1. If running inside a Paseo agent, run `mfl agent update-self`.
2. Run `mfl status`.
3. If status is `repository-root`, tell the user to create a linked worktree
   with `mfl worktree new` and stop.
4. If status is `idle` and the user provided request content, launch the first
   plan agent:

   ```bash
   mfl run --stage plan "<content>"
   ```

5. If status is `occupied`, report the thread name or id and latest agent id,
   then ask how the user wants to proceed with that existing thread.

When `mfl run` returns `agent-id: <id>` and `next-seq: <seq>`, include both in
your response. Also include `thread-id` and `worktree` when `mfl run` prints
them, then direct the user to continue in the new agent chat.

## Stage Dispatch

For staged continuation commands, run the matching stage through `mfl run` in
the current thread worktree:

```bash
mfl run --stage plan "<optional-content>"
mfl run --stage code "<optional-content>"
mfl run --stage review "<optional-content>"
mfl run --stage execute "<optional-content>"
mfl run --stage validate "<optional-content>"
```

The launched stage agent reads `mfl thread status <id> --no-color` and recent
handoffs before acting.

## Handoffs

Stage agents should read recent handoffs with:

```bash
mfl handoff get -n 5
mfl handoff get --since <seq>
```

Before finishing, agents that produce implementation, review, execution, or
validation results append a compact handoff:

```bash
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
- `agent-id`
- `next-seq`
- the next chat or command the user should use
