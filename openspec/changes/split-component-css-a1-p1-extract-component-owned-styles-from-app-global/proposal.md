## Why

`app/globals.css` currently mixes design tokens, shared primitives, and styles that only belong to specific UI components. Splitting component-owned rules into colocated CSS Modules will keep styling easier to maintain, fit Next.js App Router styling constraints, and reduce the risk of unrelated global stylesheet changes affecting isolated surfaces.

## What Changes

- Materialize the `split-component-css-a1-p1-extract-component-owned-styles-from-app-global` OpenSpec change for proposal "Extract component-owned styles from `app/globals.css`".
- Audit `app/globals.css` and separate truly global concerns from selectors that are clearly owned by individual components or views.
- Move component-owned selector families into colocated `*.module.css` files and update the affected React components to import module styles instead of relying on literal global class strings.
- Keep shared tokens, resets, layout shell primitives, and intentionally reused classes in `app/globals.css` to avoid unnecessary churn or duplicated styles.
- Preserve existing UI behavior and visual parity while validating the refactor with formatting, linting, and build checks after implementation.

## Capabilities

### New Capabilities
- `split-component-css-a1-p1-extract-component-owned-styles-from-app-global`: Reorganize styling by moving component-owned rules out of `app/globals.css` into colocated CSS Modules, update the owning React components to consume module exports, and keep only global or intentionally shared concerns in `app/globals.css`.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor(ui/styles): split component stylesheets`
- Conventional title metadata: `refactor(ui/styles)`
- Slash-delimited scope stays in conventional-title metadata and does not alter the OpenSpec change path.

## Impact

- Affected repository: `meow-team`
- Primary code areas: `app/globals.css`, the owning React components, and new colocated `*.module.css` files across the affected UI surfaces
- Design guardrail: follow Next.js App Router constraints by using CSS Modules for component-level styles instead of introducing new arbitrary global CSS imports
- Validation expectation after implementation: `pnpm fmt`, `pnpm lint`, and `pnpm build` if the refactor spans multiple major UI surfaces
- Approval note: keep pooled coding and review lanes idle until a human approves this proposal
