## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Relocate thread status into the chat link strip" and confirm the canonical request/PR title is `feat(thread/header): relocate thread status strip`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat(thread/header)` stays separate from `branchPrefix` and change paths

## 2. Thread Header Consolidation

- [x] 2.1 Remove the active-thread `.workspace-editor-meta` row from `components/team-workspace.tsx` and render the selected thread status plus archived badge inside `.thread-chat-link-strip` in `components/thread-detail-timeline.tsx`
- [x] 2.2 Preserve existing status labels and archived-state visibility while keeping the change presentation-only and scoped to the selected thread detail surfaces

## 3. Shared Styling And Validation

- [x] 3.1 Delete the obsolete `.workspace-editor-meta` rules and mobile override from `app/globals.css`, then narrow the chat-strip chip selectors so plain metadata chips, links, and `.status-pill` elements coexist without regressions
- [x] 3.2 Run the relevant validation and capture reviewer findings for "Relocate thread status into the chat link strip"
