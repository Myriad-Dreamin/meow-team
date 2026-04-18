// API docs: docs/api/team/feedback.md
import { NextResponse } from "next/server";
import { z } from "zod";
import { TeamThreadReplanError } from "@/lib/team/coding";
import { startAssignmentReplan } from "@/lib/team/thread-actions";

export const runtime = "nodejs";

const feedbackSchema = z
  .object({
    threadId: z.string().trim().min(1),
    assignmentNumber: z.number().int().positive(),
    scope: z.enum(["assignment", "proposal"]),
    laneId: z.string().trim().min(1).optional(),
    suggestion: z.string().trim().min(1, "A suggestion is required."),
  })
  .superRefine((value, context) => {
    if (value.scope === "proposal" && !value.laneId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["laneId"],
        message: "A proposal lane ID is required for proposal-scoped feedback.",
      });
    }
  });

export async function POST(request: Request) {
  try {
    const body = feedbackSchema.parse(await request.json());
    const nextRun = await startAssignmentReplan(body);

    return NextResponse.json(
      {
        accepted: nextRun.accepted,
        status: nextRun.status,
        threadId: nextRun.threadId,
        startedAt: nextRun.startedAt,
      },
      { status: 202 },
    );
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

    if (error instanceof TeamThreadReplanError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to submit human feedback.",
      },
      { status: 500 },
    );
  }
}
