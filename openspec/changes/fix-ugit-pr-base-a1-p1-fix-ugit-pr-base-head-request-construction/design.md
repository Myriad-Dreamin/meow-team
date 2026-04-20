## Context

The ugit adapter under `lib/platform/ugit` already accepts both `branchName`
and `baseBranch` when synchronizing a pull request, but the actual ugit command
construction only guarantees the base target. When ugit has to infer the source
branch from current repository state or partial request data, it can treat the
base branch as both source and target, which triggers server-side validation
failures. This proposal stays narrowly focused on request construction and
mocked regression coverage.

## Goals / Non-Goals

**Goals:**

- Ensure ugit PR create and sync flows always send the dedicated lane branch as
  the head/source branch and the configured base branch as the target branch.
- Keep the existing `SynchronizeGitPlatformPullRequestArgs` contract intact if
  possible because it already carries both required branch values.
- Preserve existing ugit adapter behaviors unrelated to branch targeting,
  including PR discovery, merged-PR rejection, draft handling, and returned URL
  shape.
- Add regression tests that fail if ugit request construction reverts to
  inferred or same-branch base/head behavior.

**Non-Goals:**

- Redesign the shared platform adapter interfaces unless the ugit CLI contract
  makes a minimal signature change unavoidable.
- Change GitHub platform behavior or unrelated harness workflow logic.
- Add live ugit integration tests or require a running ugit server.
- Rework branch publication or remote normalization beyond what is necessary to
  construct valid pull-request requests.

## Decisions

### Use explicit ugit head/source branch arguments in both PR paths

`synchronizeUgitPullRequest` should construct ugit create and sync/edit
requests from the explicit method arguments rather than relying on the checked
out branch or provider inference. This addresses the root cause while keeping
branch intent local to the adapter.

Alternative considered: change callers so the correct branch is always checked
out before sync runs. This was rejected because it still leaves request
construction ambiguous and pushes provider-specific correctness outside the
adapter boundary.

### Keep the fix inside the ugit adapter boundary

The shared platform contract already provides `branchName` and `baseBranch`, so
the safest fix is to update ugit-specific command construction in
`lib/platform/ugit/index.ts` or its thin helper layer. That keeps GitHub and
other shared entrypoints untouched.

Alternative considered: widen the shared contract or introduce provider-wide
branch-target normalization. This was rejected because the observed bug is in
ugit request construction, not missing caller data.

### Cover new and existing PR flows with mocked command assertions

Regression coverage should assert the ugit command or request payload for both
new PR creation and existing PR refresh flows. Mocked tests give stable
coverage for exact branch-target arguments without depending on a live ugit
installation or server.

Alternative considered: only test returned PR metadata. This was rejected
because it would miss the exact request construction bug that causes same-branch
validation failures.

## Conventional Title

- Canonical request/PR title:
  `fix(platform/ugit): align ugit PR branch targets`
- Conventional title metadata: `fix(platform/ugit)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter the OpenSpec change path.

## Risks / Trade-offs

- [ugit CLI flag names differ between create and sync flows] -> Inspect the
  existing ugit adapter helper contract and keep command construction localized
  so one fix updates both paths consistently.
- [Tests assert the wrong level of detail] -> Verify the mocked assertions cover
  the concrete head/source and base/target arguments that ugit consumes.
- [A hidden caller assumption still depends on current checkout state] ->
  Preserve branch arguments end-to-end in the adapter and avoid fallback logic
  that re-reads repository state for PR targeting.

## Migration Plan

1. Update ugit pull-request command construction to include explicit head/source
   and base/target branch arguments.
2. Add mocked regression tests for new PR creation and existing PR sync flows.
3. Run focused Vitest coverage plus `pnpm fmt` and `pnpm lint`.
4. Run `pnpm build` only if the implementation changes shared adapter contracts
   or integration wiring.

## Open Questions

- Which existing ugit helper or command wrapper is the narrowest place to
  express the explicit head/source branch so both create and refresh flows stay
  aligned?
