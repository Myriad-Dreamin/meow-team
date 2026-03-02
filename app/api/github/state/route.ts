import { handleGitHubStateGet } from "@/lib/github-module/api";

export const runtime = "nodejs";

export const GET = handleGitHubStateGet;
