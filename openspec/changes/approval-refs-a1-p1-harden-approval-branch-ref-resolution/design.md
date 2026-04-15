## Context

Approval-time workflow code reads branch heads through the shared
`getBranchHead` helper in `lib/git/ops.ts`. Proposal approval, post-coding
review checkpoints, and final archive approval all depend on that helper, and
today it shells `git rev-parse <branchName>` directly. That is fragile for
slash-delimited request branches such as
`requests/workflow-pages/.../a1-proposal-1`, where Git can treat the input as
an ambiguous revision or missing path. The fix also needs to respect legacy
persisted branch identifiers that may already be stored on lanes.

## Goals / Non-Goals

**Goals:**

- Resolve local request branch heads through explicit ref-safe lookups during
  proposal approval, machine-review checkpoints, and final archive approval.
- Preserve compatibility with existing persisted branch identifiers, including
  already-qualified refs or older namespace shapes.
- Add focused regression coverage for nested request branch namespaces and the
  reported approval failure.
- Keep stored branch names, branch-generation rules, and approval workflow
  states unchanged.

**Non-Goals:**

- Rename existing branches or migrate persisted lane records.
- Redesign proposal approval, machine review, or final approval sequencing.
- Broaden the git helper change beyond branch-head resolution.

## Decisions

### Resolve local branches through explicit refs first

`getBranchHead` should prefer explicit local refs when callers pass a short
request branch name. For values that are already special references such as
`HEAD` or fully qualified refs under `refs/*`, the helper should verify and use
them as-is. For short persisted names, it should check the matching local
`refs/heads/<branch>` ref before falling back to compatibility paths.

Alternative considered: require every caller to pass `refs/heads/...`
explicitly. This was rejected because persisted lane data and existing helper
consumers already store short branch names and special refs.

### Keep approval flows on the shared helper

Proposal approval, review-time commit refreshes, and final archive approval
should continue to call the shared branch-head helper so one hardening change
covers the full approval pipeline.

Alternative considered: patch only proposal approval. This was rejected because
review and archive flows refresh the same branch heads and would keep failing
for the same nested request namespaces.

### Preserve compatibility through fallback resolution

If an explicit local `refs/heads/<branch>` lookup is absent, the helper should
fall back to compatible legacy or fully-qualified inputs rather than forcing a
branch rename. This keeps older persisted lane records valid while still
preferring unambiguous local refs for current request branches.

Alternative considered: normalize stored names during migration. This was
rejected because it adds data-rewrite risk to a targeted approval fix.

### Cover the fix at both git-helper and workflow levels

The change should add repo-backed tests for the low-level branch-head helper
and approval-flow regressions for nested request namespaces such as
`requests/workflow-pages/.../a1-proposal-1`.

Alternative considered: rely only on mocked workflow tests. This was rejected
because the reported failure is rooted in Git ref parsing and needs a real
repository assertion.

## Risks / Trade-offs

- [Fallback order resolves the wrong ref] -> Prefer `refs/heads/<branch>` for
  short request branches and keep compatibility fallbacks narrow.
- [Fix lands only in one approval stage] -> Reuse the shared helper anywhere
  approval or archive code refreshes branch heads.
- [Legacy persisted branch names still exist in storage] -> Preserve resolution
  compatibility instead of requiring migrations.

## Migration Plan

1. Harden the shared branch-head helper in `lib/git/ops.ts`.
2. Reuse that helper in proposal approval and the adjacent review or archive
   checkpoints that refresh request branch heads.
3. Add regression coverage for nested request namespaces and compatibility
   fallbacks.
4. Validate with targeted tests plus repository-standard formatting, linting,
   and build checks before handoff.

## Open Questions

- None. Existing persisted branch identifiers should be treated as
  compatibility inputs during implementation rather than a migration target.
