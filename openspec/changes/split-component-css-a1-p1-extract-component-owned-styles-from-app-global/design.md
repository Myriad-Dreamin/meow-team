## Context

This change captures proposal "Extract component-owned styles from `app/globals.css`" as OpenSpec change `split-component-css-a1-p1-extract-component-owned-styles-from-app-global`.
The current global stylesheet appears to contain large selector families such as `client-exception-*`, `task-output-window-*`, `thread-chat-*`, `thread-command-editor*`, `team-request-editor*`, and workspace/sidebar/status-bar rules that are better maintained near their owning components. The refactor must preserve existing visuals, respect Next.js App Router styling constraints, and avoid turning ambiguous shared styles into brittle component-specific copies.

## Goals / Non-Goals

**Goals:**
- Move clearly component-owned selectors out of `app/globals.css` into colocated CSS Modules.
- Update the owning React components to consume module exports instead of literal global class names.
- Keep `app/globals.css` focused on tokens, resets, shell-level layout primitives, and intentionally shared classes.
- Preserve behavior and visual parity while leaving the codebase in a more maintainable styling structure.

**Non-Goals:**
- Redesign component visuals or adjust layout structure beyond what the stylesheet move requires.
- Force every shared primitive out of `app/globals.css` when ownership is ambiguous or the class is reused broadly.
- Split styles into many micro-files when a selector family is still shared across sibling components.

## Decisions

- Use one OpenSpec change for the full stylesheet split because the CSS relocation and JSX class updates are tightly coupled and should land together.
- Start extraction with the largest isolated selector families already visible in `app/globals.css`, especially `client-exception-*`, `task-output-window-*`, `thread-chat-*`, `thread-command-editor*`, `team-request-editor*`, and workspace/sidebar/status-bar groups.
- Treat shared selector families conservatively: keep them global if multiple sibling components depend on them and ownership cannot be assigned cleanly without churn.
- Prefer colocated CSS Modules for component-level styles to stay compatible with Next.js App Router restrictions on non-root global CSS imports.
- Convert JSX class usage explicitly during migration, including conditional class composition where components currently rely on literal string class names.

## Conventional Title

- Canonical request/PR title: `refactor(ui/styles): split component stylesheets`
- Conventional title metadata: `refactor(ui/styles)`
- Slash-delimited scope stays in conventional-title metadata and does not alter the OpenSpec change path.

## Risks / Trade-offs

- [Shared ownership ambiguity] -> Keep questionable selector families in `app/globals.css` until a single owner is clear.
- [Behavior drift during JSX updates] -> Migrate class references alongside each stylesheet move and compare affected surfaces for visual parity.
- [Over-fragmented styling] -> Group rules by owning component or view instead of creating many tiny CSS files.
- [Validation gaps across major UI surfaces] -> Run `pnpm fmt`, `pnpm lint`, and `pnpm build` after implementation when the refactor touches broad UI areas.
