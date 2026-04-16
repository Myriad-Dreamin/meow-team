## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Hide the left sidebar by default" and confirm the canonical request/PR title is `feat(workspace/sidebar): collapse left sidebar by default`
- [x] 1.2 Confirm the reveal control stays outside the sidebar, the change remains scoped to workspace shell behavior, and conventional-title metadata `feat(workspace/sidebar)` stays separate from `branchPrefix` and change paths

## 2. Sidebar Visibility

- [x] 2.1 Introduce default-collapsed sidebar visibility state in `components/team-workspace.tsx` and keep selected run/settings/thread state independent from sidebar visibility
- [x] 2.2 Add an always-visible reveal/toggle control in `components/team-status-bar.tsx` with accessible labels, active state, and open/close wiring for the sidebar

## 3. Layout and Coverage

- [x] 3.1 Update `app/globals.css` so collapsing the sidebar removes its desktop column and narrow-screen stacked block while preserving reopened archived-thread and repository-group behavior
- [x] 3.2 Add focused Vitest coverage for sidebar visibility helpers or toggle-state logic, then run the relevant validation before review
