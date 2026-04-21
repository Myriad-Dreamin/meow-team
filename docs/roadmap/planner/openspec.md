---
title: OpenSpec
outline: deep
---

# OpenSpec

## Proposal Materialization

Track how the planner writes OpenSpec proposal artifacts, snapshots the
pre-run repository state, and validates that materialization only changes the
intended proposal path.

## Isolation Rules

Track the git-based isolation rules for planner materialization, including the
distinction between tolerated untracked residue and tracked or committed
contamination outside the proposal directory.

## Metadata Contracts

Track canonical request titles, conventional-title scope metadata, and the
proposal-path rules that later archive and pull-request workflows rely on
staying deterministic.

## Related Specs

- [planner-tracked-paths-a1-p1-validate-planner-materialization-with-tracke](../../../openspec/changes/archive/2026-04-21-planner-tracked-paths-a1-p1-validate-planner-materialization-with-tracke/specs/planner-tracked-paths-a1-p1-validate-planner-materialization-with-tracke/spec.md)
