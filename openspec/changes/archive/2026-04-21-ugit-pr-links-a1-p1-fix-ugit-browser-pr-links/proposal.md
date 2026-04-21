## Why

Ugit pull-request links currently reuse the `origin` transport location, so a
repository can emit browser URLs like
`/home/kamiyoru/work/ts/ugit/.data/repos/revival#pull-request=6` instead of a
real ugit web route. This change adds a repository-local browser-server
default and stable repository-slug derivation so ugit PR links open the review
UI at `http://localhost:17121/owner/repo/pull-requests/<id>` without changing
GitHub behavior.

## What Changes

- Introduce the `ugit-pr-links-a1-p1-fix-ugit-browser-pr-links` OpenSpec
  change for proposal "Fix ugit browser PR links".
- Add repository-local ugit browser-server configuration with a default of
  `http://localhost:17121/`, plus explicit CLI config commands so owners can
  override the browser base URL per repository or worktree.
- Rework ugit remote resolution so `origin` fetch and push URLs remain
  transport metadata while browser link generation derives an `owner/repo`
  slug from stable repository metadata, preferably the `upstream` remote,
  instead of `.data/repos/<name>` storage paths.
- Update ugit pull-request URL generation to emit browser paths like
  `http://localhost:17121/Myriad-Dreamin/revival/pull-requests/6` instead of
  `#pull-request=<id>` fragments on filesystem or ssh transport URLs.
- Add focused regression coverage for repository-local config persistence, CLI
  UX, and ugit URL generation across local-path and ssh `origin` remotes while
  keeping GitHub link behavior unchanged.
- Validate the implementation with `pnpm fmt`, `pnpm lint`, targeted Vitest
  coverage, and `pnpm build` if the shared config or adapter surface changes
  broadly enough to warrant a full build.

## Capabilities

### New Capabilities

- `ugit-pr-links-a1-p1-fix-ugit-browser-pr-links`: Correct ugit browser-link
  generation by adding repository-local browser-server config, stable browser
  repository slug resolution, and ugit PR URL generation that targets the ugit
  web UI instead of transport paths.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `fix: correct ugit PR links`
- Conventional title metadata: `fix`
- The conventional-title metadata stays explicit and does not alter the
  approved change path
  `ugit-pr-links-a1-p1-fix-ugit-browser-pr-links`.

## Impact

- Affected repository: `meow-team`
- Affected code and tests: `lib/config/repository.ts`, `lib/cli/app.ts`,
  `lib/cli/commands/config.ts`, new or updated ugit-specific config commands,
  `lib/platform/ugit/index.ts`, shared platform helpers or types if needed,
  and focused Vitest coverage under `lib/config`, `lib/cli`, `lib/platform`,
  and `lib/team`
- Affected systems: repository-local CLI config, ugit remote/browser URL
  resolution, ugit pull-request link generation, and regression coverage for
  GitHub-versus-ugit platform behavior
- External dependency surface: no new external service dependency, but ugit
  browser links default to the local ugit web server at `http://localhost:17121/`
  unless the repository-local override is configured
- Planner deliverable: single proposal recommended because config UX, browser
  URL derivation, and ugit adapter regression coverage need to land together
  to make the fix testable and approval-ready
- Pool note: coder and reviewer lanes stay idle until the owner approves this
  proposal
