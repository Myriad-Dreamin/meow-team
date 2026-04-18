## 1. Command Contract

- [x] 1.1 Add the dedicated thread-command parser and API route that accept a
      raw slash command, scope execution to the latest assignment on the selected
      thread, and reject unsupported syntax with explicit errors
- [x] 1.2 Extract or share server helpers so command execution reuses the
      existing proposal approval, final approval, and replanning orchestration
      paths instead of duplicating state transitions

## 2. Thread Detail UI

- [x] 2.1 Add a bottom thread command composer to the selected thread detail
      view with helper text for `/approve`, `/ready`, `/replan`, and
      `/replan-all`, plus pending and result states for submissions
- [x] 2.2 Enforce idle-thread gating in the thread UI, keep command execution
      scoped to the latest assignment, and preserve the current approval and
      feedback controls behind the new command surface

## 3. Command Execution Behavior

- [x] 3.1 Implement `/approve` and `/ready` so explicit proposal numbers resolve
      against latest-assignment `laneIndex` values and missing proposal numbers run
      sequential batch approval or final approval across eligible lanes
- [x] 3.2 Implement `/replan` and `/replan-all` so they require feedback text,
      reuse the existing replanning flow, reject busy or archived threads, and
      return clear success, skip, and error summaries

## 4. Coverage and Docs

- [x] 4.1 Add regression tests for parser behavior, idle gating, latest
      assignment lane resolution, sequential batch handling, partial skips, and UI
      disabled and pending states
- [x] 4.2 Update the API docs for the thread-command endpoint and command UI
      behavior, then run the required formatting and validation commands for the
      touched files
