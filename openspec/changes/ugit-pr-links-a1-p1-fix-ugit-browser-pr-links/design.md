## Context

The repository-local CLI config surface currently persists `meow-team.platform`
but does not expose any ugit browser-server settings. The ugit adapter also
treats the normalized `origin` fetch and push remote as both transport
metadata and the returned browser repository URL, so repositories whose
`origin` points at `.data/repos/<name>.git` storage paths emit PR links like
`<transport-url>#pull-request=6` instead of a real ugit web route. This change
needs to add an explicit browser base URL, derive a stable browser repository
slug from repository metadata, and keep GitHub behavior unchanged.

## Goals / Non-Goals

**Goals:**

- Add repository-local ugit browser-server configuration with a default of
  `http://localhost:17121/`.
- Extend the CLI config surface so ugit browser base-url overrides are
  explicit, repository-local, and testable.
- Derive ugit browser repository URLs from stable repository metadata,
  preferably the `upstream` remote, instead of from `origin` storage paths.
- Rebuild ugit pull-request URLs around browser repository routes like
  `/owner/repo/pull-requests/<id>`.
- Add focused regression coverage for config persistence, CLI UX, and ugit
  browser URL generation without changing GitHub behavior.

**Non-Goals:**

- Change GitHub repository or pull-request link generation.
- Redesign the general repository-local config system beyond the ugit browser
  base-url addition.
- Change ugit pull-request discovery, base/head branch targeting, or merge
  handling outside the browser-link fix.
- Add support for providers beyond the existing `github` and `ugit` adapters.

## Decisions

### Store the ugit browser base URL in repository-local git config

The CLI should add an explicit `meow-team config ugit base-url <url>` command
and persist the override under a repository-local git config key such as
`meow-team.ugit.base-url`. Runtime resolution should default to
`http://localhost:17121/` when the key is unset so existing ugit repositories
gain a working browser target without manual setup, while owners can still
override the server URL per repository or worktree.

Alternative considered: deriving the browser host from `origin` or an
environment variable. This was rejected because storage-path remotes do not
identify the browser host, and environment-only configuration would be harder
to test and less discoverable than repository-local CLI UX.

### Derive the browser repository slug from stable repository metadata

Ugit browser links should stop treating `origin` as a source of user-facing
repository identity. Instead, the adapter should resolve an `owner/repo` slug
from stable repository metadata, preferring the repository's `upstream`
remote, and only use `origin` fetch and push URLs for Git transport and ugit
CLI operations. If no stable browser slug can be derived, the system should
fail clearly instead of silently reusing `.data/repos/<name>` storage paths as
browser URLs.

Alternative considered: extracting the repository name from `.data/repos/<name>`
or from the ssh path in `origin`. This was rejected because it loses the owner
segment and reproduces the broken filesystem-style URLs that motivated the
request.

### Keep transport metadata and browser URLs separate inside the ugit adapter

The ugit adapter should continue returning `fetchUrl` and `pushUrl` from the
configured `origin` remote for transport purposes, but it should resolve a
separate browser repository URL from the configured base URL plus the derived
slug. User-facing URLs such as returned PR links should use the browser
repository URL, while push and ugit CLI calls continue using the transport
remote.

Alternative considered: replacing the transport remote URL with the browser URL
everywhere. This was rejected because `git push` and ugit CLI commands still
need the real `origin` transport endpoint.

### Build PR browser routes through shared path helpers and cover both remote cases

The ugit adapter should build pull-request links from the browser repository
URL with a dedicated helper that emits `/pull-requests/<id>` paths and
normalizes leading or trailing slashes in the configured base URL. Regression
tests should cover the broken local-path `origin` case, an ssh `origin` case,
the default browser base URL, explicit overrides, and a GitHub no-regression
path.

Alternative considered: keeping the current `#pull-request=<id>` fragment
format and only swapping the hostname. This was rejected because the requested
browser route is path-based and the fragment form is what currently resolves to
the wrong target.

## Conventional Title

- Canonical request/PR title: `fix: correct ugit PR links`
- Conventional title metadata: `fix`
- The conventional-title metadata stays explicit and does not alter the
  approved change path
  `ugit-pr-links-a1-p1-fix-ugit-browser-pr-links`.

## Risks / Trade-offs

- [Repositories do not expose a stable browser slug] -> Prefer the `upstream`
  remote and fail with an actionable error instead of generating storage-path
  browser links.
- [The default localhost server is wrong for some repositories] -> Provide an
  explicit repository-local CLI override and cover trailing-slash handling in
  tests.
- [Shared platform helpers regress GitHub behavior] -> Keep GitHub wiring
  unchanged and add focused GitHub no-regression coverage alongside the ugit
  tests.
- [Browser routes diverge from other ugit link shapes] -> Limit the spec
  requirement to the PR path fix now and leave branch or commit route expansion
  to follow-up work if the web UI needs it.

## Migration Plan

1. Add repository-local config helpers for the ugit browser base URL and wire
   the new CLI config command and help output.
2. Rework ugit browser repository resolution so transport remotes stay
   transport-only and browser links derive from stable repo metadata plus the
   configured base URL.
3. Update ugit pull-request URL generation and add focused regression coverage
   for config persistence, CLI UX, and local-path versus ssh `origin` cases.
4. Validate with `pnpm fmt`, `pnpm lint`, targeted Vitest coverage, and
   `pnpm build` if shared config or platform types change broadly enough.

## Open Questions

- Should ugit branch and commit links keep their existing fragment-style routes
  against the new browser repository URL, or does the ugit web UI expose path
  routes worth aligning in a follow-up change?
