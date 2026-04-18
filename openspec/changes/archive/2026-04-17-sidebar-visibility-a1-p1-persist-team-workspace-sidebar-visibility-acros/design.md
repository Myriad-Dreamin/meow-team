## Context

This change captures proposal "Persist team workspace sidebar visibility across
refreshes" as OpenSpec change
`sidebar-visibility-a1-p1-persist-team-workspace-sidebar-visibility-acros`.
`TeamWorkspace` already owns sidebar visibility state and already persists other
browser-local preferences such as the selected tab and desktop-notification
settings. The sidebar currently still initializes from
`DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY`, so a refresh always collapses it
back to the default even when the owner intentionally opened it.

## Goals / Non-Goals

**Goals:**

- Persist the TeamWorkspace sidebar visibility flag in browser `localStorage`
  for the Next.js web workspace.
- Restore a valid stored visibility value during workspace initialization
  without changing the existing collapsed fallback.
- Keep the current status-bar toggle UX, accessible labels, and sidebar
  navigation behavior unchanged apart from persistence across refreshes.
- Add focused Vitest coverage for storage parsing and persistence behavior,
  including valid, missing, and invalid stored states.

**Non-Goals:**

- Sync sidebar visibility across browsers, devices, or non-web workspace
  surfaces.
- Persist archived-thread reveal state, repository-group collapse state, or
  other workspace preferences as part of this change.
- Change the default fallback away from the current collapsed sidebar behavior.
- Introduce backend APIs, cookies, or new dependencies for sidebar persistence.

## Decisions

- Store sidebar visibility in browser `localStorage` under a dedicated
  TeamWorkspace key rather than in server state or URL state. This preference is
  already browser-scoped, matches how other workspace UI settings behave today,
  and avoids expanding the feature into account-level or cross-device syncing.
  Alternative considered: persist through backend or cookies. Rejected because
  it adds scope, API surface, and synchronization questions that the request
  explicitly excludes.
- Extend `components/team-workspace-sidebar-visibility.ts` with dedicated read,
  parse, and write helpers instead of parsing inline in `TeamWorkspace`. This
  keeps the storage contract in one place, gives tests a small pure surface to
  cover, and preserves the component's responsibility for wiring state rather
  than validating storage payloads. Alternative considered: keep all storage
  reads and writes inline in `components/team-workspace.tsx`. Rejected because
  it duplicates logic and makes invalid-state coverage harder to isolate.
- Accept only explicit stored boolean string values and treat missing or invalid
  data as the existing collapsed default. This makes the storage contract easy
  to reason about, prevents malformed payloads from changing the initial shell
  state, and gives the requested "safe fallback" behavior without a broader
  migration layer. Alternative considered: permissive JSON parsing. Rejected
  because the stored value is a single flag and does not need a more complex
  format.
- Initialize `isSidebarVisible` from a lazy client-side state initializer and
  persist it through a dedicated effect. This restores the preference on the
  first client render while ensuring all visibility changes, including future
  non-click updates, flow through one persistence path. Alternative considered:
  hydrate in a post-mount effect only. Rejected because it would briefly render
  the wrong sidebar state before applying the stored preference.

## Conventional Title

- Canonical request/PR title: `feat: persist workspace sidebar visibility`
- Conventional title metadata: `feat`
- Conventional-title metadata stays explicit and does not alter `branchPrefix`
  or the OpenSpec change path
  `sidebar-visibility-a1-p1-persist-team-workspace-sidebar-visibility-acros`.

## Risks / Trade-offs

- [Corrupt browser storage changes initial layout unexpectedly] -> Restrict the
  parser to explicit boolean values and fall back to the current collapsed
  default for anything else.
- [State restoration introduces first-render churn] -> Use a lazy initializer in
  the client component instead of a post-mount correction effect.
- [Scope expands into a general preferences project] -> Keep persistence limited
  to the single sidebar visibility flag and document other workspace state as
  non-goals.
- [Non-web surfaces diverge from web behavior] -> Keep the requirement and
  implementation explicitly browser-local until another approved proposal covers
  additional surfaces.

## Migration Plan

- No data migration is required. Browsers without a stored sidebar value will
  continue to start from the existing collapsed default.
- Roll back by removing the sidebar visibility storage helpers and restoring the
  current default-only initialization path. Any stale browser storage key can be
  left in place because the rollback would ignore it.

## Open Questions

- None for proposal approval. Cross-device sync, repository-group persistence,
  and non-web workspace parity remain out of scope for this change.
