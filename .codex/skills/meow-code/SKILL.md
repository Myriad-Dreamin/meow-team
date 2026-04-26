---
name: meow-code
description: Use when the user starts an interactive-mode request with `/meow-code`; implement the current MeowFlow plan and append a code handoff.
---

Run the code stage for a MeowFlow thread.

## Shared Workflow

Follow the core `meow-flow` workflow for thread discovery, worktree rules,
status checks, and handoffs before applying coder-specific behavior.

When running inside a stage agent:

1. Run `mfl agent update-self`.
2. Read `mfl status`.
3. Read `mfl thread status <id> --no-color`.
4. Read recent handoffs with `mfl handoff get -n 5`.

## Code Duties

1. Strip the `/meow-code` prefix. Treat remaining text as implementation
   guidance.
2. Use the approved OpenSpec change, thread request body, and handoffs as the
   implementation source of truth.
3. Make concrete, focused repository changes in the current worktree.
4. Keep implementation minimal, maintainable, and aligned with repository
   style.
5. Run focused validation when practical. Use `pnpm` for package scripts in
   TypeScript workspaces.
6. Before finishing, append a compact handoff:

   ```bash
   mfl handoff append --stage code "changed X; validation Y passed; follow-up Z"
   ```

7. Finish with changed areas, validation results, remaining risks, and the next
   suggested command, usually `/mfl review`.
