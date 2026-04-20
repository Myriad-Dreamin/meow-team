---
title: Executing
outline: deep
---

# Executing

## Execute-Mode Routing

Track how planning normalizes `/execution `, `/benchmark `, and `/experiment `
request commands into persisted assignment metadata so approved lanes can route
through `lib/team/executing/*` without changing the default coder/reviewer flow
for unprefixed work.

## Lane Runtime

Track the execute-mode stage handlers, final-archive behavior, and lane-state
helpers that keep executor and execution-reviewer passes aligned with the
existing `lib/team/coding/index.ts` coordinator.

## Guidance And Validation

Track subtype-specific guide lookup, the `AGENTS.md` fallback path, and the
review contract for committed scripts, validators or reproducible validation
commands, and summarized collected data.

## Related Specs

- [execute-mode-a1-p1-add-execute-mode-workflow-and-roles](../../../openspec/changes/archive/2026-04-18-execute-mode-a1-p1-add-execute-mode-workflow-and-roles/specs/execute-mode-a1-p1-add-execute-mode-workflow-and-roles/spec.md)
- [team-request-editor-a1-p1-replace-the-team-request-textarea-with-a-codem](../../../openspec/changes/archive/2026-04-19-team-request-editor-a1-p1-replace-the-team-request-textarea-with-a-codem/specs/team-request-editor-a1-p1-replace-the-team-request-textarea-with-a-codem/spec.md)
- [slash-exec-mode-a1-p1-require-slash-prefixed-execution-mode-triggers](../../../openspec/changes/archive/2026-04-20-slash-exec-mode-a1-p1-require-slash-prefixed-execution-mode-triggers/specs/slash-exec-mode-a1-p1-require-slash-prefixed-execution-mode-triggers/spec.md)
