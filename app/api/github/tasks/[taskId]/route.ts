import { handleGitHubTaskPatch } from "@/lib/github-module/api";

export const runtime = "nodejs";

export const PATCH = handleGitHubTaskPatch;
