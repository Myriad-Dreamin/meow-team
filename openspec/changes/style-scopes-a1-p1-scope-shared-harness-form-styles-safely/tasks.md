## 1. Scope shared harness form selectors

- [x] 1.1 Rename the shared harness form selectors in `app/globals.css` from
      generic names to one app-specific namespace and keep the related rules in
      a clearly scoped block.
- [x] 1.2 Preserve the current shared form layout and interaction styling while
      updating the renamed selector family, including row layout, hint text,
      textarea overflow, and focus treatment.

## 2. Update affected harness consumers

- [x] 2.1 Update `components/team-console.tsx`,
      `components/thread-command-composer.tsx`,
      `components/thread-status-board.tsx`, and
      `components/thread-detail-timeline.tsx` to use the renamed shared form
      class names consistently.
- [x] 2.2 Verify there are no remaining harness call sites that depend on the
      old generic selector names and confirm the rename does not reuse another
      ambiguous generic class.

## 3. Validate the scoped styling change

- [x] 3.1 Run `pnpm lint` after the class-name and JSX updates land.
- [x] 3.2 Review the affected form surfaces for preserved layout and interaction
      behavior, then run broader validation such as `pnpm build` only if the
      implementation touches structural rendering paths.
