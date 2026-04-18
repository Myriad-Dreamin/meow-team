// API docs: docs/api/team/threads/threadId/command.md
import { NextResponse } from "next/server";
import { z } from "zod";
import { TeamThreadReplanError } from "@/lib/team/coding";
import { executeThreadCommand, TeamThreadCommandError } from "@/lib/team/thread-command-server";
import { ThreadCommandParseError } from "@/lib/team/thread-command";

export const runtime = "nodejs";

const threadCommandSchema = z.object({
  command: z.string().trim().min(1),
});

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { threadId } = await context.params;
    const body = threadCommandSchema.parse(await request.json());
    const result = await executeThreadCommand({
      threadId,
      commandText: body.command,
    });

    return NextResponse.json(result, {
      status: result.outcome === "accepted" ? 202 : 200,
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

    if (error instanceof ThreadCommandParseError || error instanceof TeamThreadCommandError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: error instanceof TeamThreadCommandError ? error.statusCode : 400 },
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
        error:
          error instanceof Error ? error.message : "Unable to execute the thread slash command.",
      },
      { status: 500 },
    );
  }
}
