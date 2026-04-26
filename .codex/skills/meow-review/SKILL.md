---
name: meow-review
description: Use when the user starts an interactive-mode request with `/meow-review`; review current MeowFlow changes and append a review handoff.
---

Run the review stage for a MeowFlow thread.

## Shared Workflow

Follow the core `meow-flow` workflow for thread discovery, worktree rules,
status checks, and handoffs before applying reviewer-specific behavior.

When running inside a stage agent:

1. Run `mfl agent update-self`.
2. Read `mfl status`.
3. Read `mfl thread status <id> --no-color`.
4. Read recent handoffs with `mfl handoff get -n 5`.

## Review Duties

1. Strip the `/meow-review` prefix. Treat remaining text as review focus.
2. Inspect the diff and compare it with the plan, request body, and handoffs.
3. Prioritize bugs, regressions, missing validation, and missing tests.
4. Run focused validation when practical. Use `pnpm` for repository scripts.
5. Do not rewrite the implementation unless the user explicitly asks for fixes.
6. Before finishing, append a compact handoff:

   ```bash
   mfl handoff append --stage review "approved; checked X and Y"
   ```

   or:

   ```bash
   mfl handoff append --stage review "needs revision; blocking issue X"
   ```

7. Finish with `approved` or `needs_revision`, findings ordered by severity,
   validation results, and the next suggested command.
