// API docs: docs/api/team/status.md
import { NextResponse } from "next/server";
import { getTeamHostStatusSnapshot } from "@/lib/status/host";
import { getTeamWorkspaceStatusSnapshot } from "@/lib/team/history";
import { teamConfig } from "@/team.config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sampledAt = new Date().toISOString();
    const workspace = await getTeamWorkspaceStatusSnapshot(teamConfig.storage.threadFile);
    const host = getTeamHostStatusSnapshot();

    return NextResponse.json(
      {
        sampledAt,
        workspace,
        host,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load workspace status.",
      },
      { status: 500 },
    );
  }
}
