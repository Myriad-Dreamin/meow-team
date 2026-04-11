// API docs: docs/api/team/logs.md
import { NextResponse } from "next/server";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { listTeamCodexLogEntries } from "@/lib/team/logs";

export const runtime = "nodejs";

const logsQuerySchema = z.object({
  threadId: z.string().trim().min(1),
  limit: z.coerce.number().int().positive().max(500).optional().default(200),
});

export async function GET(request: Request) {
  try {
    const parsed = logsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );

    const entries = await listTeamCodexLogEntries({
      threadFile: teamConfig.storage.threadFile,
      threadId: parsed.threadId,
      limit: parsed.limit,
    });

    return NextResponse.json({
      entries,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid query parameters.",
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
