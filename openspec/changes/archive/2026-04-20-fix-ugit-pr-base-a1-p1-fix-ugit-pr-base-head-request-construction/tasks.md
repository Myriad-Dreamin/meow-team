## 1. Proposal Alignment

- [x] 1.1 Keep the canonical request/PR title as `fix(platform/ugit): align ugit PR branch targets` and preserve conventional-title metadata `fix(platform/ugit)` in all artifacts
- [x] 1.2 Keep scope limited to ugit pull-request request construction, mocked regression coverage, and validation for this focused bug fix

## 2. Ugit Adapter Fix

- [x] 2.1 Inspect the ugit create and sync request helpers to identify the supported explicit head/source branch argument for `branchName`
- [x] 2.2 Update `lib/platform/ugit/index.ts` so pull-request synchronization sends `branchName` as the PR head/source branch and `baseBranch` as the PR target for both new and existing PR flows
- [x] 2.3 Preserve current ugit behavior for PR discovery, merged-PR rejection, title/body handling, draft state, and returned URL shape

## 3. Regression Coverage

- [x] 3.1 Add mocked tests in `lib/platform/ugit/index.test.ts` for new PR creation that assert the command/request includes the dedicated lane branch as the head/source branch
- [x] 3.2 Add mocked tests in `lib/platform/ugit/index.test.ts` for existing PR sync/refresh that assert the command/request keeps `baseBranch` and `branchName` distinct and does not rely on inferred checkout state

## 4. Validation

- [x] 4.1 Run focused Vitest coverage for the ugit adapter regression cases
- [x] 4.2 Run `pnpm fmt` and `pnpm lint`
- [x] 4.3 Run `pnpm build` if the implementation changes shared adapter contracts or integration wiring
