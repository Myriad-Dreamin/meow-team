---
title: GET /api/team/threads/:threadId
outline: deep
---

# GET /api/team/threads/:threadId

Returns a fully expanded thread record for one thread ID.

## Route file

`app/api/team/threads/[threadId]/route.ts`

## Path parameters

| Name       | Type   | Required | Notes                                                                                                                                                           |
| ---------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `threadId` | string | Yes      | Taken from the route segment and used to load the stored thread detail. Living threads refresh pending dispatch work first; archived threads are read directly. |

## Success response

```json
{
  "thread": {
    "summary": {},
    "userMessages": [],
    "steps": [],
    "handoffs": [],
    "dispatchAssignments": []
  }
}
```

The `thread` object is a serialized `TeamThreadDetail` value with these
top-level sections:

| Field                 | Notes                                      |
| --------------------- | ------------------------------------------ |
| `summary`             | The current `TeamThreadSummary`.           |
| `userMessages`        | Stored user messages for the thread.       |
| `steps`               | Planner and execution step history.        |
| `handoffs`            | Ordered role handoffs across the workflow. |
| `dispatchAssignments` | Assignment history, newest first.          |

Archived threads continue to load through this route so archived detail polling
stays stable after the thread disappears from the living sidebar. When a thread
is archived, `thread.summary.archivedAt` contains the archive timestamp.

## Related routes

- [`POST /api/team/threads/:threadId/command`](/api/team/threads/threadId/command) runs
  slash commands against the latest idle assignment on the same thread.
- [`POST /api/team/threads/:threadId/archive`](/api/team/threads/threadId/archive) archives
  one inactive thread after work is complete.

## Failure modes

| Status | When                                           |
| ------ | ---------------------------------------------- |
| `404`  | No thread exists for the requested `threadId`. |
| `500`  | The thread could not be loaded.                |
