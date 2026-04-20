## 1. Harness form primitive split

- [x] 1.1 Refactor `app/globals.css` so `.harness-form-field` stays layout-only
      and caption/native `input`/`select`/`textarea` styling moves to explicit
      harness native-field hooks.
- [x] 1.2 Update `components/team-console.tsx`,
      `components/thread-status-board.tsx`, and
      `components/thread-detail-timeline.tsx` so every affected native label and
      control uses the new caption/native-control path without changing current
      copy, placeholders, or submission behavior.

## 2. Editor boundary preservation

- [x] 2.1 Verify `components/thread-command-composer.tsx`,
      `components/team-request-editor.tsx`, and
      `components/thread-command-editor.tsx` keep the request and command editors
      on their existing module-scoped CodeMirror styling rather than any harness
      native-field descendant styling.
- [x] 2.2 Confirm the planner request editor and thread command editor keep
      their current placeholder, disabled-state, focus, and helper-copy behavior
      after the form primitive split.

## 3. Regression coverage

- [x] 3.1 Extend focused tests around the harness form CSS contract and the
      adjacent request or command components so reintroducing broad descendant
      selectors fails quickly.
- [x] 3.2 Update targeted editor or form tests to prove native controls retain
      their shared chrome while `TeamRequestEditor` and `ThreadCommandEditor`
      remain isolated from harness form-field styling, then run the relevant
      formatter, lint, and test validation.
