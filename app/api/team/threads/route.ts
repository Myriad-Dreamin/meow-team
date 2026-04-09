import { NextResponse } from "next/server";
import { teamConfig } from "@/team.config";
import { listTeamThreadSummaries } from "@/lib/team/history";

export const runtime = "nodejs";

export async function GET() {
  const threads = await listTeamThreadSummaries(teamConfig.storage.threadFile);
  return NextResponse.json({
    threads,
  });
}
