## 1. Finalization Contract

- [ ] 1.1 Extend the machine-reviewed approval contract from one archive-only
      action to explicit `archive` and `delete` finalization modes across the
      approval API, thread actions, run args, and final-approval stage wiring.
- [ ] 1.2 Replace the single machine-reviewed approval helper with an action set
      that renders `Approve and Archive` and `Approve and Delete` with mode-specific
      pending, success, and error copy in the thread status, detail, and timeline
      views.

## 2. Finalization Flow

- [ ] 2.1 Refactor archive-only finalization into a shared flow plus
      mode-specific proposal-artifact handling so archive mode keeps the current
      move-to-archive behavior and delete mode removes `openspec/changes/<change>`,
      creates the deletion commit, pushes the updated branch head, and then refreshes
      the existing GitHub PR.
- [ ] 2.2 Persist explicit finalization intent, artifact disposition, and
      partial-completion checkpoints in lane state and history so retries remain
      idempotent after delete-before-push or delete-before-PR-refresh failures.
- [ ] 2.3 Add guardrails and completed-lane messaging for proposals that are
      already archived or already deleted so incompatible finalization modes fail
      cleanly.

## 3. Validation and Docs

- [ ] 3.1 Add regression coverage for action derivation and UI rendering,
      approval API validation, delete-mode finalization success, delete-before-PR
      failure resume behavior, and archived/deleted state guardrails.
- [ ] 3.2 Update approval and finalization documentation, run `pnpm fmt`, run
      the relevant Vitest coverage, then run `pnpm lint` and `pnpm build`.
