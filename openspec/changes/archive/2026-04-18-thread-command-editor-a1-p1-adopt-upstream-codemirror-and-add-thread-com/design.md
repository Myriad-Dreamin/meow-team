## Context

The current thread command editor in `components/thread-command-editor.tsx`
imports a local `@/packages/codemirror` shim, while the root `package.json`
declares `codemirror` as `workspace:*` and review coverage explicitly guards
that contract. The composer already keeps draft state, disabled gating,
pending state, and notices in the selected thread detail flow, and
`lib/team/thread-command.ts` already owns helper-copy and placeholder strings,
but there is no shared metadata model for autocomplete or parser-aligned
syntax descriptions.

The approved change replaces the local editor runtime with the real upstream
CodeMirror 5 package and adds client-side autocomplete without changing the
underlying thread-command endpoint semantics. That keeps the work focused on
editor integration, shared command metadata, and proposal-number suggestions
derived from the existing latest-assignment thread state.

## Goals / Non-Goals

**Goals:**

- Replace the workspace-linked `packages/codemirror` shim with the upstream
  CodeMirror 5 distribution that matches the current `fromTextArea`-style API.
- Preserve the current thread command editor contract: placeholder guidance,
  read-only handling, ARIA sync, loading or error fallback, draft ownership,
  submit-button gating, pending state, and inline notices.
- Centralize supported command metadata in `lib/team/thread-command.ts` so the
  parser, helper text, placeholder text, and autocomplete suggestions use one
  source of truth.
- Add assignment-aware autocomplete for `/approve`, `/ready`, `/replan`, and
  `/replan-all` by using the latest thread detail state instead of adding a
  new API.
- Update CSS and regression coverage for the upstream editor DOM and hint
  dropdown behavior.

**Non-Goals:**

- Change backend slash-command semantics, latest-assignment targeting rules, or
  server-side approval and replanning behavior.
- Add new slash commands, free-form AI assistance, or autocomplete requests to
  a backend service.
- Redesign the broader thread detail panel or change the disabled gating and
  result UX outside the editor surface.
- Switch editor families to CodeMirror 6 or introduce a larger wrapper library
  when the approved scope assumes the current CodeMirror 5 API shape.

## Decisions

- Use the upstream `codemirror` package directly and remove the local workspace
  shim from the editor integration. This matches the request, keeps the API
  compatible with the current editor shape, and allows addon-based behavior
  such as placeholder and hint support without maintaining a private runtime.
  Alternative considered: keep the shim and extend it with autocomplete.
  Rejected because it preserves the dependency divergence that this proposal is
  meant to remove.
- Keep a dedicated `ThreadCommandEditor` adapter that mounts CodeMirror only on
  the client and preserves the current loading or error fallback. The component
  already isolates browser-only editor setup from the rest of the thread
  detail panel, so continuing to use that boundary keeps SSR-safe markup and
  node-based tests stable. Alternative considered: inline upstream CodeMirror
  setup directly in `ThreadCommandComposer`. Rejected because it would couple
  browser-only lifecycle code to the broader composer layout.
- Represent supported commands through shared metadata in
  `lib/team/thread-command.ts`. The metadata should define the command name,
  syntax text, whether proposal-number completion is relevant, and whether
  requirement text is mandatory. Helper copy, placeholder text, parser-facing
  syntax strings, and autocomplete suggestions can then derive from the same
  source instead of repeating command literals in separate files. Alternative
  considered: keep parser literals and hand-built autocomplete data separate.
  Rejected because it increases drift risk across helper copy, errors, and UI
  suggestions.
- Build autocomplete from the current thread detail state instead of a new API.
  The composer already knows the selected thread and latest assignment, so the
  editor can suggest command names from shared metadata and proposal numbers
  from the latest assignment's sorted proposal lanes. Alternative considered:
  fetch completion suggestions from a dedicated endpoint. Rejected because the
  needed data is already present on the page and server round trips would add
  latency plus a new API surface for a purely local interaction.
- Keep autocomplete additive to the existing command lifecycle. Selecting or
  typing suggestions must still update the same draft state used today, while
  disabled threads remain read-only and pending or result notices stay where
  they are. Alternative considered: redesign the composer around a richer
  command palette interaction. Rejected because it would expand scope beyond
  the approved request.
- Update styling and tests around the actual upstream DOM contract. The current
  CSS targets the shim's `.CodeMirror` structure and current review coverage
  asserts a `workspace:*` dependency, so the implementation needs focused CSS
  updates plus coverage for shared metadata and hint behavior. Alternative
  considered: rely on upstream default styling and remove the current guards.
  Rejected because the thread panel needs consistent styling and the dependency
  contract is a key part of this proposal.

## Conventional Title

- Canonical request/PR title: `feat: integrate upstream CodeMirror command autocomplete`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Upstream DOM and CSS drift] -> Scope editor and hint styling under the
  thread-command composer selectors and verify the actual upstream class names
  in focused regression coverage.
- [Autocomplete drift from parser syntax] -> Generate helper copy, placeholder
  text, and completion data from shared command metadata and keep parser tests
  aligned to the same supported command list.
- [Stale proposal-number suggestions] -> Derive suggestions from the current
  latest assignment state on each render instead of caching a separate proposal
  list or adding a backend completion API.
- [Browser-only addon behavior under Vitest] -> Keep autocomplete matching
  logic in pure helpers that can be unit-tested without a browser and leave the
  editor adapter responsible only for wiring the upstream runtime.
- [Dependency-review regressions] -> Update package wiring, lockfile, and
  review guards together so `workspace:*` assumptions do not fail after the
  upstream package lands.

## Migration Plan

1. Replace the root `codemirror` dependency and lockfile entry with the
   approved upstream package, then remove the local shim path from the editor
   integration and related guard tests.
2. Extract shared thread-command metadata in `lib/team/thread-command.ts`, then
   update helper text, placeholder text, and parser-facing syntax strings to
   read from that metadata.
3. Rework `ThreadCommandEditor` around the upstream runtime, add assignment-
   aware autocomplete wiring from the current thread detail state, and update
   thread command styling for the upstream editor DOM plus hint dropdown.
4. Update focused regression coverage and validate with `pnpm fmt`,
   `pnpm lint`, targeted `pnpm test`, and `pnpm build` when the dependency or
   CSS integration affects the build surface.
5. Roll back by restoring the workspace shim dependency and removing the
   autocomplete integration; backend command behavior remains unchanged.

## Open Questions

- None for the approved scope. This design assumes the requested "real
  upstream package" is the CodeMirror 5 distribution compatible with the
  current API shape; if implementation proves otherwise, that should trigger a
  follow-up planning pass instead of an in-flight editor-family switch.
