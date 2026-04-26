---
name: meow-validate
description: Use when the user starts an interactive-mode request with `/meow-validate`; validate execution-mode work and append a validation handoff.
---

Run the validation stage for a MeowFlow thread.

## Shared Workflow

Follow the core `meow-flow` workflow for thread discovery, worktree rules,
status checks, and handoffs before applying validation-specific behavior.

When running inside a stage agent:

1. Run `mfl agent update-self`.
2. Read `mfl status`.
3. Read `mfl thread status <id> --no-color`.
4. Read recent handoffs with `mfl handoff get -n 5`.

## Validation Duties

1. Strip the `/meow-validate` prefix. Treat remaining text as validation focus.
2. Review reproducibility, scripts, validators, summary artifacts, and raw data
   handling.
3. For dataset work, use `meow-dataset` to confirm configured dataset paths,
   generation logs, and validators.
4. Run focused validation when practical.
5. If requesting changes, include a concrete follow-up artifact such as a
   failing test, validator, or clear todo.
6. Before finishing, append a compact handoff:

   ```bash
   mfl handoff append --stage validate "approved; reproduced X with command Y"
   ```

   or:

   ```bash
   mfl handoff append --stage validate "needs revision; missing validator X"
   ```

7. Finish with `approved` or `needs_revision`, findings ordered by severity,
   validation commands, and the next suggested command.
