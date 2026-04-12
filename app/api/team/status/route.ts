// API docs: docs/api/team/status.md
import { NextResponse } from "next/server";
import { getTeamHostStatusSnapshot } from "@/lib/status/host";
import { getTeamWorkspaceStatusSnapshot } from "@/lib/team/history";
import { getTeamServerState } from "@/lib/team/server-state";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sampledAt = new Date().toISOString();
    const serverState = await getTeamServerState();
    const workspace = await getTeamWorkspaceStatusSnapshot(serverState.threadStorage);
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
