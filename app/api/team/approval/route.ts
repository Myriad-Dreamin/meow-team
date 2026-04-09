import { NextResponse } from "next/server";
import { z } from "zod";
import { approveLaneProposal } from "@/lib/team/dispatch";

export const runtime = "nodejs";

const approveLaneSchema = z.object({
  threadId: z.string().trim().min(1),
  assignmentNumber: z.number().int().positive(),
  laneId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const body = approveLaneSchema.parse(await request.json());
    await approveLaneProposal(body);

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
