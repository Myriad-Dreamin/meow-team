## Context

The harness keeps shared form styling in `app/globals.css`, and several UI
surfaces consume the same generic selectors: `field`, `field-row`, and
`field-hint`. That naming leaks beyond the app boundary and already conflicts
with a separate `.field` selector under `editors/vscode/media/styles.css`.

This change is intentionally narrow. The goal is to isolate the shared harness
form primitives without migrating the UI to CSS modules or redesigning the
forms. The affected components are the team console, thread command composer,
thread status board, and thread detail timeline.

## Goals / Non-Goals

**Goals:**

- Replace generic shared form selectors with an app-owned namespace that is
  safe to keep global.
- Update every affected JSX call site in the harness so the renamed selectors
  apply consistently.
- Preserve the current visual behavior for labels, field hints, two-column row
  layout, focus treatment, and textarea scrolling.
- Make the shared form block in `app/globals.css` visibly scoped so future
  additions do not reintroduce generic selector names.

**Non-Goals:**

- Rebuild the form styling architecture around CSS modules, Tailwind, or a new
  design system.
- Refresh unrelated UI styling or clean up unrelated selectors in
  `app/globals.css`.
- Change the VS Code extension stylesheet beyond using it as collision context.

## Decisions

### Use one harness-specific namespace for shared form primitives

The implementation will rename `.field`, `.field-row`, and `.field-hint` to a
single harness-owned naming family such as `team-form-field`,
`team-form-row`, and `team-form-hint` or an equivalent app-specific variant
that matches nearby conventions. Keeping one consistent namespace makes missed
call sites easier to review and lowers the chance of future collisions.

Alternative considered: renaming only `.field`. This was rejected because the
companion selectors would remain generic, which keeps the shared style block
ambiguous and makes later regressions more likely.

### Keep the styles global but isolate them in a clearly labeled block

The shared form rules are still reused across multiple components, so a global
block remains appropriate for this repository. The change should keep that
block together under a clearly scoped comment or grouping in `app/globals.css`
instead of spreading identical rules into each component.

Alternative considered: moving the styles into per-component CSS modules. This
was rejected because it expands the change far beyond the collision fix and
adds migration risk without solving a broader approved problem.

### Treat visual parity as a requirement of the rename

The rename is not complete unless the existing layout and interaction details
still work, especially row grouping, hint spacing, textarea overflow, and
focus styles. The coding lane should therefore verify the affected surfaces
after updating the classes instead of treating the work as a pure search and
replace.

Alternative considered: accepting small incidental UI drift. This was rejected
because silent layout regressions are the main risk when renaming shared style
hooks.

## Risks / Trade-offs

- [Missed JSX call site] → Update all known component consumers together and
  verify the final selector names with a repository search before finishing.
- [Partial selector rename] → Rename the full shared selector family, not just
  `.field`, and keep the stylesheet block internally consistent.
- [Visual drift after rename] → Check the affected form surfaces for preserved
  row layout, hint text spacing, and textarea/focus behavior after the rename.
- [Future generic additions] → Leave the shared block clearly labeled and
  namespaced so later edits follow the same pattern.
