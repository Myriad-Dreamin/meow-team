---
name: meow-plan
description: Use when the user starts an interactive-mode request with `/meow-plan`; plan a MeowFlow thread and create the matching proposal without editing production code.
---

Run the planner role for a MeowFlow thread.

## Shared Workflow

Start by following the core `meow-flow` workflow for current thread discovery,
worktree rules, status checks, and handoff expectations.

When running inside a stage agent:

1. Run `mfl agent update-self`.
2. Read `mfl status`.
3. Read `mfl thread status <id> --no-color` for the current thread.
4. Read recent handoffs with `mfl handoff get -n 5` when they exist.

## Planning Duties

1. Strip the `/meow-plan` prefix. Treat remaining text as the planning request.
2. Choose a readable unused kebab-case thread name such as
   `install-meow-flow-skills`, unless the user explicitly requested an
   existing branch or name. Thread names must match
   `^[a-z0-9]+(-[a-z0-9]+)*$`: lowercase ASCII letters and digits separated by
   single hyphens, with no underscores, spaces, leading hyphen, or trailing
   hyphen.
3. Persist the name:

   ```bash
   mfl thread set name '<name>'
   ```

4. If the repository uses OpenSpec, create the matching OpenSpec change with
   the same name. Prefer project-local OpenSpec proposal skills or commands.
5. Keep planning scoped. Do not edit production code.
6. Commit proposal artifacts. Respect `git config --local paseo.prompt.title`
   when set; otherwise infer the local title style from recent main-branch
   commits. Use `docs: add proposal <name>` as the fallback.
7. Finish with a concise planning handoff and the next suggested stage, usually
   `/mfl code` or `/mfl execute`.

The coding and review stages stay idle until the user approves or asks for the
next stage.
