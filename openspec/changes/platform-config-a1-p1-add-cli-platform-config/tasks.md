## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Add CLI platform config"
      and confirm the canonical request/PR title is
      `feat(cli/platform): wire cli platform config`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable
      worktree from
      `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be
      claimed, and conventional-title metadata `feat(cli/platform)` stays
      separate from `branchPrefix` and change paths

## 2. CLI Bootstrap

- [x] 2.1 Add the package/bin wiring and Clipanion command tree for a stable
      `meow-team` CLI with `config platform <github|ugit>` as the first
      supported command
- [x] 2.2 Resolve the target repository from `process.cwd()` and reject command
      execution outside a git repository with an explicit error

## 3. Repository-Local Config

- [x] 3.1 Add a focused helper for repository-local git-config reads and writes
      that stores the selected platform under `meow-team.platform` and
      normalizes missing values cleanly
- [x] 3.2 Keep the config layer extensible for future `meow-team config ...`
      subcommands and make the platform command report clear success and error
      messages

## 4. Platform Resolution

- [x] 4.1 Expand the platform ID surface to include `ugit` and refactor
      `lib/platform` so adapter resolution happens per repository path instead
      of through one global GitHub adapter
- [x] 4.2 Preserve GitHub as the default when no config is set and fail with an
      explicit unsupported-platform error when `ugit` is selected before a real
      adapter exists

## 5. Coverage and Validation

- [x] 5.1 Add targeted regression tests for command parsing, repository
      discovery, repo-local config persistence, default GitHub fallback, and
      unsupported-platform failure paths
- [x] 5.2 Run `pnpm lint`, the relevant targeted Vitest coverage, and
      `pnpm build` if the CLI bootstrap or platform refactor moves shared
      runtime boundaries
