// API docs: docs/api/team/logs.md
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeamThreadFile } from "@/lib/config/team-loader";
import { expandTeamCodexStderrBlock, listTeamCodexLogWindow } from "@/lib/team/logs";

export const runtime = "nodejs";

const windowQuerySchema = z
  .object({
    mode: z.literal("window").optional(),
    threadId: z.string().trim().min(1),
    limit: z.coerce.number().int().positive().max(500).optional().default(200),
    beforeCursor: z.coerce.number().int().nonnegative().optional(),
    afterCursor: z.coerce.number().int().nonnegative().optional(),
    source: z.enum(["stdout", "stderr", "system"]).optional(),
    assignmentNumber: z.coerce.number().int().positive().optional(),
    laneId: z.string().trim().min(1).optional(),
    roleId: z.string().trim().min(1).optional(),
  })
  .refine((value) => !(value.beforeCursor !== undefined && value.afterCursor !== undefined), {
    message: "Specify at most one cursor boundary per request.",
    path: ["beforeCursor"],
  });

const stderrBlockQuerySchema = z
  .object({
    mode: z.literal("stderr-block"),
    threadId: z.string().trim().min(1),
    startCursor: z.coerce.number().int().nonnegative(),
    endCursor: z.coerce.number().int().nonnegative(),
    scanLimit: z.coerce.number().int().positive().max(500).optional().default(200),
  })
  .refine((value) => value.startCursor < value.endCursor, {
    message: "startCursor must be less than endCursor.",
    path: ["startCursor"],
  });

const defaultQuerySchema = z.object({
  mode: z.enum(["window", "stderr-block"]).optional().default("window"),
  threadId: z.string().trim().min(1),
});

export async function GET(request: Request) {
  try {
    const threadFile = getTeamThreadFile();
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const mode = defaultQuerySchema.parse(params).mode;

    if (mode === "stderr-block") {
      const parsed = stderrBlockQuerySchema.parse(params);
      const result = await expandTeamCodexStderrBlock({
        endCursor: parsed.endCursor,
        scanLimit: parsed.scanLimit,
        startCursor: parsed.startCursor,
        threadFile,
        threadId: parsed.threadId,
      });

      return NextResponse.json({
        mode: "stderr-block",
        ...result,
      });
    }

    const parsed = windowQuerySchema.parse(params);
    const result = await listTeamCodexLogWindow({
      afterCursor: parsed.afterCursor ?? null,
      assignmentNumber: parsed.assignmentNumber ?? null,
      beforeCursor: parsed.beforeCursor ?? null,
      laneId: parsed.laneId ?? null,
      limit: parsed.limit,
      roleId: parsed.roleId ?? null,
      source: parsed.source ?? null,
      threadFile,
      threadId: parsed.threadId,
    });

    return NextResponse.json({
      mode: "window",
      ...result,
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
