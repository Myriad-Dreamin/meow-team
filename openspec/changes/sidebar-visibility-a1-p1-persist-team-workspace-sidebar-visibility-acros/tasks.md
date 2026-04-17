## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Persist team workspace sidebar visibility across refreshes" and confirm the canonical request/PR title is `feat: persist workspace sidebar visibility`
- [x] 1.2 Confirm the change stays scoped to browser-local sidebar visibility persistence in the Next.js workspace and that conventional-title metadata `feat` stays separate from `branchPrefix` and change paths

## 2. Sidebar Visibility Persistence

- [x] 2.1 Add sidebar visibility storage helpers in `components/team-workspace-sidebar-visibility.ts` that read and write the browser-local value with a safe collapsed fallback for missing or invalid storage
- [x] 2.2 Update `components/team-workspace.tsx` to initialize sidebar visibility from the stored value and persist changes when the existing toggle control opens or closes the sidebar

## 3. Coverage

- [x] 3.1 Add focused Vitest coverage for valid, missing, and invalid stored sidebar states plus persistence behavior in the sidebar visibility helper tests
- [x] 3.2 Run the relevant validation for the sidebar visibility helpers and workspace persistence behavior before review
