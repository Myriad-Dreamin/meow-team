## 1. Ref-Safe Git Resolution

- [x] 1.1 Update `lib/git/ops.ts` so branch-head lookup prefers explicit local
      refs for slash-delimited request branches while preserving `HEAD`,
      fully-qualified refs, and legacy persisted branch identifiers.
- [x] 1.2 Extend `lib/git/ops.test.ts` with repo-backed regression coverage for
      nested request branch namespaces and compatibility fallback inputs.

## 2. Approval Pipeline Adoption

- [x] 2.1 Reuse the hardened shared branch-head lookup anywhere approval-time
      branch refresh depends on it, especially proposal approval and final
      archive or PR-refresh paths under `lib/team/coding/*`.
- [x] 2.2 Add approval-flow regression coverage in `lib/team/coding/index.test.ts`
      for the reported
      `requests/workflow-pages/0784c123-bcb3-4eaf-acc3--62086a172c62c97d/a1-proposal-1`
      scenario and adjacent final-approval checkpoints.

## 3. Validation

- [x] 3.1 Run the targeted git-helper and approval-flow tests that cover the
      new slash-delimited branch cases.
- [x] 3.2 Run `pnpm fmt`, `pnpm lint`, and `pnpm build` before handoff when the
      approval-flow changes touch shared workflow wiring.
