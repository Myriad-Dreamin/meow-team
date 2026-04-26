---
name: meow-archive
description: Use when the user starts an interactive-mode request with `/meow-archive`; archive or delete the current MeowFlow thread and proposal.
---

Archive the current MeowFlow thread and release its linked worktree.

## Command Contract

- Syntax: `/meow-archive`
- Delete variant: `/meow-archive delete`
- `/mfl archive` follows the normal archive path.
- `/mfl delete` follows the delete variant.

## Normal Archive

1. Run `mfl agent update-self` when inside a Paseo agent.
2. Run `mfl status` and identify the current thread.
3. Run `mfl thread status <id> --no-color` and use the thread name as the
   OpenSpec change name when it exists.
4. If OpenSpec is present and the change exists, archive it through the
   repository OpenSpec archive workflow.
5. Run `mfl thread archive`.
6. Report the archived thread id and any OpenSpec archive result.

## Delete Variant

For `/meow-archive delete` or `/mfl delete`:

1. Resolve the current thread the same way as normal archive.
2. If OpenSpec is present and an open proposal directory matches the thread
   name, remove that open proposal directory.
3. Do not revert code changes, unstaged changes, commits, or worktree files.
4. Run `mfl thread archive`.
5. Report that proposal artifacts were deleted, or that no OpenSpec proposal
   was found.

Use the delete variant only when explicitly requested.
