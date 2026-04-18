## Context

This change captures proposal "Replace Thread Command Textarea With
CodeMirror" as OpenSpec change
`thread-command-editor-a1-p1-replace-thread-command-textarea-with-codemir`.
The selected thread detail panel already keeps thread-command draft state,
submit handling, idle-thread gating, and inline notices in
`components/thread-detail-panel.tsx`, while
`components/thread-command-composer.tsx` still renders a plain textarea shell.
The current composer tests run through `renderToStaticMarkup` in a node-only
Vitest environment, and the current textarea implementation has already
regressed by dropping the required helper copy and disabled-state copy from the
rendered markup.

The approved work needs a richer editor surface without changing slash-command
parsing or endpoint behavior. That makes the main design problem a UI-only
integration: add CodeMirror safely inside the Next.js client tree, keep the
composer controlled by the existing thread state, and preserve coverage under a
non-browser test harness.

## Goals / Non-Goals

**Goals:**

- Replace the thread command textarea with a CodeMirror-based editor that fits
  the existing selected-thread panel.
- Preserve the current thread-command draft state, submit flow, pending-state
  copy, disabled gating, and inline notice behavior.
- Restore the helper copy and disabled-state explanation copy that the current
  composer regression dropped.
- Keep the editor integration compatible with the current Next.js App Router
  client boundary and node-based Vitest setup.
- Add focused regression coverage for the equivalent editor surface and the
  restored copy requirements.

**Non-Goals:**

- Change the supported slash-command grammar, endpoint contract, or latest-assignment targeting rules.
- Redesign the broader thread-detail panel or replace other textarea surfaces in
  the repository.
- Introduce browser-only UI test infrastructure such as jsdom or Playwright for
  this change.
- Expand the command surface into chat, command history, autocomplete, or new
  keyboard-submission semantics.

## Decisions

- Add only the minimal CodeMirror packages needed for a single plain-text
  command editor. This keeps the dependency change narrow and avoids pulling in
  a larger editor wrapper stack for one controlled field.
- Isolate CodeMirror in a dedicated client-safe thread command editor
  component. The editor should render an SSR-safe shell element first and only
  create the CodeMirror view from browser-only effects, so the selected thread
  panel can keep using the component without breaking node-based markup tests.
- Keep `ThreadDetailPanel` as the source of truth for the command draft and
  submission lifecycle. The new editor component should remain controlled by
  `value`, `onChange`, and `disabled` props so the existing trim-on-submit
  logic, submit-button gating, fetch lifecycle, and notice handling remain
  unchanged.
- Restore helper and disabled copy directly in the composer shell instead of
  coupling them to the textarea implementation. The helper text, disabled
  reason, pending button label, and latest inline notice should remain visible
  regardless of which editing surface sits inside the field container.
- Style the CodeMirror surface through the existing thread composer CSS region
  in `app/globals.css`. The editor shell should inherit the thread panel's
  spacing, mono typography, focus treatment, and muted disabled state without
  expanding the work into a broader thread-tab redesign.
- Keep regression coverage node-safe. Composer tests should continue asserting
  rendered helper and disabled copy, while any CodeMirror-specific adapter
  behavior should be covered through the editor shell contract rather than a
  browser-dependent integration harness.

## Conventional Title

- Canonical request/PR title: `feat: replace thread command textarea with codemirror`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Browser-only editor runtime] -> Mount CodeMirror only after the client shell
  is available and keep the rendered shell SSR-safe so the workspace and tests
  do not touch DOM-only APIs during server rendering.
- [Controlled-editor drift] -> Keep `ThreadDetailPanel` as the single draft
  owner and wire the editor through a narrow controlled interface instead of
  duplicating command state inside the editor component.
- [Copy regression resurfacing] -> Make helper text and disabled reason part of
  the composer layout contract, then keep explicit regression assertions for
  both states.
- [Styling churn from third-party editor classes] -> Scope CodeMirror styling
  under the thread-command composer selectors so editor-specific rules do not
  leak into other fields.
- [Test coverage gaps under node-only Vitest] -> Cover the editor through
  server-renderable composer markup and small component-contract tests rather
  than broad DOM integration that the current harness does not support.

## Migration Plan

- Add the minimal CodeMirror dependencies and create the thread command editor
  adapter component behind the existing thread command composer interface.
- Replace the textarea surface in the composer, then update styles so the
  editor shell, helper copy, notices, and disabled state render consistently.
- Update regression coverage, then validate with `pnpm fmt`, `pnpm lint`,
  `pnpm test`, and `pnpm build`.
- Roll back by removing the CodeMirror dependency and restoring the textarea
  surface; the command endpoint and thread history model remain unchanged.

## Open Questions

- None for the approved scope. If the team later wants command syntax
  highlighting, autocomplete, or keyboard submission shortcuts, that should be
  proposed as a follow-up change rather than folded into this editor swap.
