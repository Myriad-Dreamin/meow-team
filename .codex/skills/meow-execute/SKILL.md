---
name: meow-execute
description: Use when the user starts an interactive-mode request with `/meow-execute`; execute script, data, automation, or artifact work and append an execution handoff.
---

Run the execute stage for a MeowFlow thread.

## Shared Workflow

Follow the core `meow-flow` workflow for thread discovery, worktree rules,
status checks, and handoffs before applying execution-specific behavior.

When running inside a stage agent:

1. Run `mfl agent update-self`.
2. Read `mfl status`.
3. Read `mfl thread status <id> --no-color`.
4. Read recent handoffs with `mfl handoff get -n 5`.

## Execute Duties

1. Strip the `/meow-execute` prefix. Treat remaining text as the execution
   objective.
2. For dataset generation or maintenance, use `meow-dataset`.
3. Create or update reproducible scripts, automation, validators, or summary
   artifacts as required by the request.
4. Prefer TypeScript for repository-local scripts when the repo is a TypeScript
   workspace.
5. Run the smallest validation that proves the execution artifact works.
6. Before finishing, append a compact handoff:

   ```bash
   mfl handoff append --stage execute "created script X; output Y; validation Z"
   ```

7. Finish with changed artifacts, commands run, output locations, and the next
   suggested command, usually `/mfl validate`.
