---
title: Planner
outline: deep
---

# Planner

This roadmap tracks planner-side request shaping before coding begins:
proposal materialization, deterministic workspace setup, and the OpenSpec
guardrails that keep planning output isolated from unrelated repository state.

## Design Notes

- Keep planner behavior grounded in explicit git state instead of ignore-file
  heuristics or hidden prompt coordination.
- Use the OpenSpec topic for proposal artifact materialization, isolation
  checks, and canonical-title metadata that later lanes depend on.
- Keep planner handoff contracts narrow so coder and reviewer lanes inherit a
  stable, reviewable branch state.

## Topics

- [OpenSpec](/roadmap/planner/openspec)
