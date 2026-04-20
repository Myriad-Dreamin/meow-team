## Why

The ugit platform adapter already receives both the dedicated lane branch and
the intended base branch, but its pull-request create and sync commands do not
consistently send both values to ugit. That lets ugit infer a same-branch
base/head pair and reject synchronization with `Pull requests must target a
different base branch.`

## What Changes

- Introduce the `fix-ugit-pr-base-a1-p1-fix-ugit-pr-base-head-request-construction`
  OpenSpec change for proposal "Fix ugit PR base/head request construction".
- Update `lib/platform/ugit/index.ts` so `synchronizeUgitPullRequest` sends the
  provided `branchName` as the PR head/source branch and the provided
  `baseBranch` as the PR target for both new PR creation and existing PR sync /
  refresh flows.
- Preserve existing ugit behavior around remote resolution, PR discovery,
  merged-PR rejection, title/body handling, draft state, and returned PR URL.
- Add focused mocked regression coverage in `lib/platform/ugit/index.test.ts`
  for new PR creation and existing PR synchronization, asserting the ugit
  request includes the dedicated branch head and does not rely on inferred
  current/base branch state.
- Validate the implementation with focused Vitest coverage, `pnpm fmt`,
  `pnpm lint`, and `pnpm build` if adapter contracts or integration wiring
  change.

## Capabilities

### New Capabilities

- `fix-ugit-pr-base-a1-p1-fix-ugit-pr-base-head-request-construction`:
  Materialize the focused ugit pull-request synchronization fix so the adapter
  always constructs valid base/head requests from explicit branch inputs.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `fix(platform/ugit): align ugit PR branch targets`
- Conventional title metadata: `fix(platform/ugit)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter the OpenSpec change path.

## Impact

- Affected repository: `meow-team`
- Affected code and tests: `lib/platform/ugit/index.ts`,
  `lib/platform/ugit/index.test.ts`, and any nearby ugit command helpers used
  to construct PR create or sync requests
- Affected systems: ugit pull-request creation and refresh flows for dedicated
  lane branches
- External dependency surface: existing `ugit` CLI request construction only;
  no new dependencies are expected
- Planner deliverable: one focused proposal because the bug, adapter fix, and
  regression tests must land together to restore valid ugit PR synchronization
