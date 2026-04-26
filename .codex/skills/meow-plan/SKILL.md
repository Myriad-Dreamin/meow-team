---
name: meow-plan
description: Use when the user starts an interactive-mode request with `/meow-plan`; use mfl to update/discover the thread, launch a plan stage agent when needed, and create the matching proposal without editing production code.
---

Launch or run the planner role for a MeowFlow thread.

## Entry Contract

- `/meow-plan ...` is not permission to plan locally before MeowFlow state is
  checked. Always go through `mfl` first.
- When invoked from the middle of an existing non-MeowFlow agent chat, spawn a
  planner with `mfl run --stage plan ...` and stop after reporting the launched
  agent details.
- Only perform planning work in the current chat when `mfl agent update-self`
  confirms this session is already the plan stage agent for the current thread.

## Coordinator Flow

1. Strip the `/meow-plan` prefix. Treat remaining text as the planning request.
2. If running inside a Paseo agent, run `mfl agent update-self`; otherwise this
   chat is not a confirmed plan stage agent.
3. If `mfl agent update-self` confirms this session is the plan stage agent,
   skip to Plan Stage Flow. Otherwise run `mfl status` and stay in
   coordinator-mode.
4. If status is `repository-root`, tell the user to create a linked worktree
   with `mfl worktree new` and stop.
5. If the user provided a planning request, launch the planner through `mfl`
   instead of doing the work locally. Preserve `--provider <provider>` when the
   entry command included it:

   ```bash
   mfl run --stage plan "<planning-request>"
   mfl run --stage plan --provider <provider> "<planning-request>"
   ```

6. Report the returned `thread-id`, `worktree`, `provider`, `agent-id`, and
   `next-seq` when `mfl run` prints them, then direct the user to continue in
   the new agent chat.
7. If no planning request was provided and the current chat is not the plan
   stage agent, report the current thread from `mfl status` and ask for the
   plan request. Do not create proposal files locally.

## Plan Stage Flow

Only follow this section after `mfl agent update-self` confirms this chat is
the current plan stage agent.

1. Run `mfl status`.
2. Read `mfl thread status <id> --no-color` for the current thread.
3. Read recent handoffs with `mfl handoff get -n 5` when they exist.
4. Choose a readable unused kebab-case thread name such as
   `install-meow-flow-skills`, unless the user explicitly requested an
   existing branch or name. Thread names must match
   `^[a-z0-9]+(-[a-z0-9]+)*$`: lowercase ASCII letters and digits separated by
   single hyphens, with no underscores, spaces, leading hyphen, or trailing
   hyphen.
5. Persist the name with the CLI before creating proposal artifacts:

   ```bash
   mfl thread set name '<name>'
   ```

   If a concurrent `mfl` update causes a transient SQLite write conflict, wait
   for the previous `mfl` command to finish and retry the thread-name write
   once before proceeding.
6. If the repository uses OpenSpec, create the matching OpenSpec change with
   the same name. Prefer project-local OpenSpec proposal skills or commands.
7. Keep planning scoped. Do not edit production code.
8. Commit proposal artifacts. Respect `git config --local paseo.prompt.title`
   when set; otherwise infer the local title style from recent main-branch
   commits. Use `docs: add proposal <name>` as the fallback.
9. Append a concise planning handoff with the next suggested stage, usually
   `/mfl code` or `/mfl execute`:

   ```bash
   mfl handoff append --stage plan "planned <name>; proposal <path>; next <stage>"
   ```

The coding and review stages stay idle until the user approves or asks for the
next stage.
