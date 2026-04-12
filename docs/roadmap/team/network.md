---
title: Network
outline: deep
---

# Network

## Unified Orchestration

Track the single-module execution path in `lib/team/network.ts`, including the
staged `runTeam` state machine, dispatch queue handling, and approval/archive
transitions that used to be split across separate modules.

## Lane Dispatch

Track planner assignment materialization, branch and worktree allocation, lane
queue scheduling, and feedback-driven replanning so dispatch behavior stays
deterministic as the harness evolves.

## Regression Coverage

Track the merged `lib/team/network.test.ts` coverage that protects slot
allocation, stale-lane handling, approval flow, and resumed-stage execution for
the unified network runtime.

## Related Specs

- [dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network](../../../openspec/changes/archive/2026-04-12-dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network/specs/dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network/spec.md)
