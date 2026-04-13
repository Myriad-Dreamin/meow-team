---
title: Coding
outline: deep
---

# Coding

## Stage Orchestration

Track the stage-oriented execution path in `lib/team/coding/index.ts`,
`lib/team/coding/plan.ts`, and the peer stage modules, including the staged
`runTeam` state machine, dispatch queue handling, and approval/archive
transitions.

## Lane Dispatch

Track planner assignment materialization, branch and worktree allocation, lane
queue scheduling, and feedback-driven replanning so dispatch behavior stays
deterministic as the harness evolves.

## Regression Coverage

Track the consolidated `lib/team/coding/index.test.ts` coverage that protects
slot allocation, stale-lane handling, approval flow, and resumed-stage
execution for the coding runtime.

## Related Specs

- [dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network](../../../openspec/changes/archive/2026-04-12-dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network/specs/dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network/spec.md)
- [coding-stages-a1-p1-split-network-ts-into-stage-oriented-lib-team-coding](../../../openspec/changes/coding-stages-a1-p1-split-network-ts-into-stage-oriented-lib-team-coding/specs/coding-stages-a1-p1-split-network-ts-into-stage-oriented-lib-team-coding/spec.md)
- [worktree-env-a1-p1-move-worktree-into-teamrunenv](../../../openspec/changes/archive/2026-04-13-worktree-env-a1-p1-move-worktree-into-teamrunenv/specs/worktree-env-a1-p1-move-worktree-into-teamrunenv/spec.md)
