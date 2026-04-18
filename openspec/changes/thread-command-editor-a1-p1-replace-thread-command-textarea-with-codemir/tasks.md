## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Replace Thread Command Textarea With CodeMirror" and confirm the canonical request/PR title is `feat: replace thread command textarea with codemirror`
- [ ] 1.2 Confirm the scope stays limited to the thread command composer, slash-command parsing and submission semantics remain unchanged, and conventional-title metadata `feat` stays separate from `branchPrefix` and change paths

## 2. Editor Foundation

- [ ] 2.1 Add the minimal CodeMirror packages and create a client-safe thread command editor component that mounts cleanly inside the Next.js App Router client tree
- [ ] 2.2 Keep the editor controlled by the existing thread-command draft state so placeholder guidance, disabled gating, and submit-button enablement stay aligned with the current composer flow

## 3. Composer Swap and Styling

- [ ] 3.1 Replace the textarea surface in the thread command composer with the CodeMirror editor while preserving helper copy, disabled-state copy, inline notices, and the current `Run Command` or `Running command...` button behavior
- [ ] 3.2 Update the thread command composer styling so the editor shell, focus treatment, and disabled appearance match the existing thread panel without expanding into a broader thread-tab redesign

## 4. Coverage and Validation

- [ ] 4.1 Update the thread command composer regression coverage for the equivalent CodeMirror surface and restore assertions for helper text plus disabled or pending copy under the current node-based Vitest constraints
- [ ] 4.2 Run `pnpm fmt`, `pnpm lint`, `pnpm test`, and `pnpm build` before review
