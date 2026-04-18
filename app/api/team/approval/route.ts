// API docs: docs/api/team/approval.md
import { NextResponse } from "next/server";
import { z } from "zod";
import { runLaneApproval } from "@/lib/team/thread-actions";

export const runtime = "nodejs";

const approveLaneSchema = z
  .object({
    threadId: z.string().trim().min(1),
    assignmentNumber: z.number().int().positive(),
    laneId: z.string().trim().min(1),
    target: z.enum(["proposal", "pull_request"]).optional(),
    finalizationMode: z.enum(["archive", "delete"]).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.finalizationMode && body.target !== "pull_request") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`finalizationMode` is only valid when `target` is `pull_request`.",
        path: ["finalizationMode"],
      });
    }
  });

export async function POST(request: Request) {
  try {
    const body = approveLaneSchema.parse(await request.json());
    await runLaneApproval({
      threadId: body.threadId,
      assignmentNumber: body.assignmentNumber,
      laneId: body.laneId,
      target: body.target,
      finalizationMode: body.finalizationMode,
    });

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
        error: error instanceof Error ? error.message : "Unable to approve the lane.",
      },
      { status: 500 },
    );
  }
}
