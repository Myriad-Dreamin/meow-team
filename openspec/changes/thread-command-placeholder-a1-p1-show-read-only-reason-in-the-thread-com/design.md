## Context

This change materializes proposal "Show read-only reason in the thread command
placeholder" under the fixed OpenSpec scaffold
`thread-command-placeholder-a1-p1-show-read-only-reason-in-the-thread-com`.
`ThreadCommandComposer` currently disables the editor whenever
`disabledReason` or `isPending` is present, but it always passes
`Enter slash commands...` as the placeholder. `ThreadCommandEditor` already
accepts a `placeholder` prop, applies it during CodeMirror initialization, and
updates it through `editor.setOption("placeholder", placeholder)` when the
prop changes.

That keeps the change intentionally small. Placeholder derivation belongs in
the composer, while the editor runtime should only need follow-up edits if
focused verification shows the existing prop sync is insufficient.

## Goals / Non-Goals

**Goals:**

- Show the exact eligibility-driven `disabledReason` as the thread command
  editor placeholder when the composer is read-only for assignment eligibility
  reasons.
- Preserve the existing `Enter slash commands...` placeholder when the editor
  is otherwise editable.
- Keep the current pending submission UX, parser behavior, and server-side
  eligibility gating unchanged.
- Add focused regression coverage for both the read-only reason path and the
  default placeholder path.

**Non-Goals:**

- Change thread-command parsing, autocomplete, or command execution.
- Introduce new pending-state placeholder copy.
- Redesign `ThreadCommandEditor` beyond any runtime placeholder sync needed to
  honor the new prop.
- Change disabled-reason generation or server-side thread-command eligibility
  rules.

## Decisions

- Derive the editor placeholder in `ThreadCommandComposer` from
  `disabledReason ?? "Enter slash commands..."`. Rationale: the composer
  already distinguishes eligibility-based read-only states from pending-only
  disablement, so it can apply the new copy without changing the editor
  contract. Alternative rejected: keying the placeholder off any disabled
  state, which would incorrectly replace the placeholder during pending
  submissions.
- Keep `isPending` as a submit and editor disablement control, but not as a
  reason-bearing placeholder state. Rationale: the approved scope is limited
  to existing eligibility reasons, and the planner explicitly called out
  pending-only copy as an approval-sensitive assumption. Alternative rejected:
  introducing new pending placeholder text inside this fix, which would expand
  the requested UI-only change.
- Reuse the existing `ThreadCommandEditor` placeholder prop and runtime sync
  path. Rationale: the editor already initializes and updates the CodeMirror
  placeholder from props, so the main change should stay in the composer
  unless targeted verification finds drift. Alternative rejected:
  proactively refactoring editor internals without evidence that placeholder
  updates fail.
- Cover the behavior at the `ThreadCommandComposer` test boundary. Rationale:
  the rendered markup already exposes `data-placeholder` and disabled state,
  which keeps regression coverage focused on the contract this change actually
  modifies. Alternative rejected: broader integration coverage for a copy-only
  change.

## Conventional Title

- Canonical request/PR title: `fix: show disabled reason in command placeholder`
- Conventional title metadata: `fix`
- Conventional-title scope remains metadata and does not alter `branchPrefix`
  or the OpenSpec change path.

## Risks / Trade-offs

- [Long disabled reasons reduce placeholder readability] -> Reuse the existing
  eligibility copy only for blocked states and keep the separate disabled
  explanation visible with the composer.
- [Pending-only disablement expectations change later] -> Encode the current
  assumption in tests and call it out explicitly so a future pending-copy
  change becomes a deliberate follow-up.
- [Runtime placeholder sync differs from server-rendered markup] -> Use the
  existing editor prop-update path first and touch
  `components/thread-command-editor.tsx` only if targeted verification reveals
  stale placeholder state.

## Migration Plan

- Update `ThreadCommandComposer` to derive the placeholder from
  `disabledReason` when present and fall back to `Enter slash commands...`
  otherwise.
- Verify the existing `ThreadCommandEditor` placeholder sync still reflects
  prop changes at runtime; only adjust editor internals if the new composer
  behavior exposes drift.
- Add focused composer regression coverage for disabled-reason and editable
  placeholder paths, then validate with `pnpm fmt`, `pnpm lint`, and targeted
  tests.
- Roll back by restoring the previous fixed placeholder string in the composer
  if the approved scope changes.

## Open Questions

- Should a pending-only submission state eventually show distinct placeholder
  copy, or should it continue to reuse `Enter slash commands...`? This
  proposal assumes the current placeholder remains until a separate approval
  expands scope.
