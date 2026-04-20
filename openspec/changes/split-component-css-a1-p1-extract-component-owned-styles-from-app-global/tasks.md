## 1. Style Ownership Audit

- [ ] 1.1 Review `app/globals.css` and group selectors into global/shared rules versus component-owned selector families.
- [ ] 1.2 Confirm ownership for the largest isolated families first, including `client-exception-*`, `task-output-window-*`, `thread-chat-*`, `thread-command-editor*`, `team-request-editor*`, and workspace/sidebar/status-bar groups.

## 2. Component Style Extraction

- [ ] 2.1 Create colocated `*.module.css` files for selectors that have clear component ownership and move those rules out of `app/globals.css`.
- [ ] 2.2 Update the affected React components to import CSS Modules, replace literal class strings with module lookups, and handle conditional classes explicitly.

## 3. Global Stylesheet Cleanup And Validation

- [ ] 3.1 Leave only tokens, resets, shell primitives, and intentionally shared classes in `app/globals.css`, keeping ambiguous shared rules global when needed.
- [ ] 3.2 Run `pnpm fmt`, `pnpm lint`, and `pnpm build` after the refactor reaches the affected UI surfaces.
