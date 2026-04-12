---
title: Roles
outline: deep
---

# Roles

## Prompt Layers

Track the separation between human-authored role system prompts in
`prompts/roles` and runtime prompt templates colocated with the role
implementations in `lib/team/roles`.

## Template Plumbing

Track typed `meow-prompt` import support, declaration sync coverage, and
regression tests that keep role templates compatible with TypeScript, Vitest,
and the app/runtime loaders.

## Workflow Expectations

Track how planner, coder, reviewer, and request-title prompt rendering
preserves deterministic handoff state, archive-time behavior, and role-specific
validation without changing the default workflow contract.

## Related Specs

- [role-prompts-a1-p1-extract-harness-role-prompt-templates](../../../openspec/changes/archive/2026-04-12-role-prompts-a1-p1-extract-harness-role-prompt-templates/specs/role-prompts-a1-p1-extract-harness-role-prompt-templates/spec.md)
