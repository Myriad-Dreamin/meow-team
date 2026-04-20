## 1. Proposal Alignment

- [x] 1.1 Confirm the canonical request/PR title is `feat(platform/ugit): add ugit platform support` and keep conventional-title metadata `feat(platform/ugit)` separate from the change path
- [x] 1.2 Keep scope limited to a first-class ugit adapter, config-based dispatch, shared normalization updates, and focused platform regression coverage

## 2. Ugit Adapter

- [x] 2.1 Add `lib/platform/ugit/index.ts` and any thin ugit command helper needed to satisfy the shared `GitPlatformAdapter` contract
- [x] 2.2 Implement ugit repository URL normalization plus branch publish and pull-request create / edit / sync behavior using the ugit CLI

## 3. Platform Dispatch

- [x] 3.1 Rework `lib/platform/index.ts` to resolve the platform adapter per repository from `meow-team.platform`, while keeping GitHub as the unset default
- [x] 3.2 Update shared remote-resolution and normalization flows so ugit repositories no longer route through GitHub-only behavior and unknown platform IDs still fail clearly

## 4. Regression Coverage

- [x] 4.1 Add or update focused tests around `lib/platform/index.test.ts` for local-config-driven adapter selection and default GitHub behavior
- [x] 4.2 Add ugit-specific adapter tests that cover publish and pull-request synchronization behavior with stable command expectations

## 5. Validation

- [x] 5.1 Run focused Vitest coverage for platform config and ugit adapter behavior
- [x] 5.2 Run `pnpm fmt`, `pnpm lint`, and `pnpm build`
