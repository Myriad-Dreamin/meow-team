---
title: Worktree
outline: deep
---

# Worktree

## Managed Checkout Lifecycle

Track the reusable `meow-N` worktree pool, branch reuse, and reset behavior
that lets planner, coder, reviewer, and final archive passes operate on the
same checkout without cross-lane leakage.

## Git And GitHub CLI Hygiene

Track how git and `gh` subprocesses resolve stable system binaries instead of
worktree-local shims, especially when `node_modules/.bin` contains wrappers
that hardcode stale `.git-local` paths.

## Tracking PR Flow

Track the lifecycle where proposal approval opens or refreshes a draft tracking
PR, machine review rebases the lane onto `main`, and final approval refreshes
the same PR instead of creating a second one.

## Related Specs

- [worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure](../../../openspec/changes/archive/2026-04-12-worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure/specs/worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure/spec.md)
