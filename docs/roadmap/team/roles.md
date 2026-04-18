---
title: Roles
outline: deep
---

# Roles

## Prompt Source

Track the single prompt-authoring source in `lib/team/roles/*.prompt.md`,
where each planner/coder/reviewer/executor/execution-reviewer template carries
both frontmatter metadata and the runtime system instructions used by the
harness.

## Metadata Wiring

Track how the role modules derive IDs, names, summaries, and file paths from
their colocated prompt frontmatter instead of a separate prompt registry.

## Template Plumbing

Track typed `meow-prompt` import support, declaration sync coverage for
`lib/team/roles`, and regression tests that keep role templates compatible
with TypeScript, Vitest, and the app/runtime loaders.

## Workflow Expectations

Track how planner, coder, reviewer, executor, execution-reviewer, and
request-title prompt rendering preserves deterministic handoff state,
execute-mode guide lookup, archive-time behavior, and role-specific validation
without changing the default workflow contract.

## Related Specs

- [role-prompts-a1-p1-extract-harness-role-prompt-templates](../../../openspec/changes/archive/2026-04-12-role-prompts-a1-p1-extract-harness-role-prompt-templates/specs/role-prompts-a1-p1-extract-harness-role-prompt-templates/spec.md)
