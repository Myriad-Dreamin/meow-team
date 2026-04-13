---
title: POST /api/team/feedback
outline: deep
---

# POST /api/team/feedback

Submits human feedback, prepares a replan, and starts the next planning run in
the background.

## Route file

`app/api/team/feedback/route.ts`

## Request body

| Field              | Type                           | Required    | Notes                                  |
| ------------------ | ------------------------------ | ----------- | -------------------------------------- |
| `threadId`         | string                         | Yes         | Existing thread to revise.             |
| `assignmentNumber` | number                         | Yes         | Positive assignment number.            |
| `scope`            | `"assignment"` or `"proposal"` | Yes         | Proposal feedback requires a lane ID.  |
| `laneId`           | string                         | Conditional | Required when `scope` is `"proposal"`. |
| `suggestion`       | string                         | Yes         | Non-empty human feedback.              |

## Success response

The route returns `202 Accepted` and immediately starts a new planning run.

```json
{
  "accepted": true,
  "status": "planning",
  "threadId": "thread-id",
  "startedAt": "2026-04-12T00:00:00.000Z"
}
```

## Failure modes

| Status | When                                                               |
| ------ | ------------------------------------------------------------------ |
| `400`  | The request body fails validation.                                 |
| `404`  | The target thread does not exist.                                  |
| `409`  | The thread is archived, superseded, or still has active lane work. |
| `500`  | Runtime configuration is incomplete or feedback processing fails.  |
