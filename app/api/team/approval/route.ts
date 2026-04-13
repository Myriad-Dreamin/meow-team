// API docs: docs/api/team/approval.md
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  runTeam,
} from "@/lib/team/coding";

export const runtime = "nodejs";

const approveLaneSchema = z.object({
  threadId: z.string().trim().min(1),
  assignmentNumber: z.number().int().positive(),
  laneId: z.string().trim().min(1),
  target: z.enum(["proposal", "pull_request"]).optional(),
});

export async function POST(request: Request) {
  try {
    const body = approveLaneSchema.parse(await request.json());
    const initialState = createInitialTeamRunState(
      body.target === "pull_request"
        ? {
            kind: "pull-request-approval",
            threadId: body.threadId,
            assignmentNumber: body.assignmentNumber,
            laneId: body.laneId,
          }
        : {
            kind: "proposal-approval",
            threadId: body.threadId,
            assignmentNumber: body.assignmentNumber,
            laneId: body.laneId,
          },
    );
    const env = createTeamRunEnv();
    await persistTeamRunState(env, initialState);
    await runTeam(env, initialState);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to approve the proposal.",
      },
      { status: 500 },
    );
  }
}
