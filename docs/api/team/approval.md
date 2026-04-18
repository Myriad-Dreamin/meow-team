---
title: POST /api/team/approval
outline: deep
---

# POST /api/team/approval

Approves a proposal or pull request for a worker lane.

## Route file

`app/api/team/approval/route.ts`

## Request body

| Field              | Type                             | Required | Notes                                       |
| ------------------ | -------------------------------- | -------- | ------------------------------------------- |
| `threadId`         | string                           | Yes      | Thread that owns the assignment.            |
| `assignmentNumber` | number                           | Yes      | Positive assignment number.                 |
| `laneId`           | string                           | Yes      | Worker lane identifier.                     |
| `target`           | `"proposal"` or `"pull_request"` | No       | Defaults to proposal approval when omitted. |
| `finalizationMode` | `"archive"` or `"delete"`        | No       | Only valid for `target: "pull_request"`.    |

## Success response

```json
{
  "ok": true
}
```

## Failure modes

| Status | When                                                |
| ------ | --------------------------------------------------- |
| `400`  | The JSON body does not satisfy the approval schema. |
| `500`  | The approval action could not be completed.         |
