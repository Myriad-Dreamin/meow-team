import { NextResponse } from "next/server";
import { teamConfig } from "@/team.config";
import { listTeamThreadSummaries } from "@/lib/team/history";
import { ensurePendingDispatchWork } from "@/lib/team/dispatch";

export const runtime = "nodejs";

export async function GET() {
  await ensurePendingDispatchWork();
  const threads = await listTeamThreadSummaries(teamConfig.storage.threadFile);
  return NextResponse.json({
    threads,
  });
}
