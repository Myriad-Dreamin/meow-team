---
title: GET /api/team/threads/:threadId
outline: deep
---

# GET /api/team/threads/:threadId

Returns a fully expanded thread record for one thread ID.

## Route file

`app/api/team/threads/[threadId]/route.ts`

## Path parameters

| Name       | Type   | Required | Notes                                                                                             |
| ---------- | ------ | -------- | ------------------------------------------------------------------------------------------------- |
| `threadId` | string | Yes      | Taken from the route segment and used to refresh pending dispatch work before loading the record. |

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

## Failure modes

| Status | When                                           |
| ------ | ---------------------------------------------- |
| `404`  | No thread exists for the requested `threadId`. |
| `500`  | The thread could not be loaded.                |
