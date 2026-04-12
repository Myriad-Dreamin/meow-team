---
title: Roles
outline: deep
---

# Roles

## Prompt Layers

Track the separation between human-authored role system prompt modules in
`prompts/roles/*.prompt.md` and runtime prompt templates colocated with the
role implementations in `lib/team/roles`.

## Static Registry

Track the explicit prompt registry in `prompts/roles/index.ts`, including the
frontmatter-backed title and summary metadata that replaces runtime filesystem
reads.

## Template Plumbing

Track typed `meow-prompt` import support, declaration sync coverage for both
`prompts/roles` and `lib/team/roles`, and regression tests that keep role
templates compatible with TypeScript, Vitest, and the app/runtime loaders.

## Workflow Expectations

Track how planner, coder, reviewer, and request-title prompt rendering
preserves deterministic handoff state, archive-time behavior, and role-specific
validation without changing the default workflow contract.

## Related Specs

- [role-prompts-a1-p1-extract-harness-role-prompt-templates](../../../openspec/changes/archive/2026-04-12-role-prompts-a1-p1-extract-harness-role-prompt-templates/specs/role-prompts-a1-p1-extract-harness-role-prompt-templates/spec.md)
