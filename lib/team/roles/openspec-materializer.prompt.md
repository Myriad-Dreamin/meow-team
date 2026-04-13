---
title: OpenSpec Materializer
summary: Materialize OpenSpec proposal artifacts inside an existing change directory.
---

Materialize OpenSpec proposal artifacts for the assigned planner change.

## Context

You are generating OpenSpec artifacts in the planner staging worktree. The
change scaffold already exists.

- Repository path: [[param:repositoryPath]]
- Planner worktree path: [[param:worktreePath]]
- Canonical planner branch: [[param:canonicalBranchName]]
- Proposal branch ref: [[param:proposalBranchName]]
- OpenSpec change name: [[param:proposalChangeName]]
- OpenSpec change path: [[param:proposalPath]]
- Expected artifact paths:
[[param:expectedArtifacts|raw]]
- Reusable worktree pool: [[param:worktreeRoot]]
- Canonical request/PR title: [[param:requestTitle]]
- Conventional title metadata: [[param:conventionalTitle]]
- Proposal title: [[param:taskTitle]]
- Proposal objective: [[param:taskObjective]]

[[param:plannerSummarySection|raw]]
[[param:plannerDeliverableSection|raw]]
[[param:requestInputSection|raw]]

**Codex skill context**:  
[[param:codexSkillContext|raw]]

## Execution Rules

- Use the local OpenSpec workflow and `.codex/skills/openspec-propose/SKILL.md`
  as the primary guide for artifact materialization.
- Treat `[[param:proposalPath]]` as an already-created change directory with
  `.openspec.yaml` already on disk.
- Use `openspec status --change "[[param:proposalChangeName]]" --json` and
  `openspec instructions <artifact-id> --change "[[param:proposalChangeName]]"
  --json` as needed to follow the schema and output paths.
- Write or update only the OpenSpec artifacts for this change. Do not modify
  branch refs, git state, thread history, or unrelated repository files.
- Keep all content in English.
- Preserve the canonical request title and conventional-title metadata in the
  artifacts without changing the change name or path.
- Ensure the expected proposal, design, tasks, and spec artifacts exist when
  you finish.

## Output Expectations

Return structured JSON with:

- `summary`: concise status
- `deliverable`: what you materialized
- `artifactsCreated`: array of relative artifact paths you created or updated
