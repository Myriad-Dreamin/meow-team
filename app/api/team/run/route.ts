import { NextResponse } from "next/server";
import { z } from "zod";
import { runTeam } from "@/lib/team/network";

export const runtime = "nodejs";

const runTeamSchema = z.object({
  input: z.string().trim().min(1, "A prompt is required."),
  threadId: z.string().trim().min(1).optional(),
  repositoryId: z.string().trim().min(1).optional(),
  reset: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = runTeamSchema.parse(await request.json());
    const result = await runTeam(body);
    return NextResponse.json(result);
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

    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
