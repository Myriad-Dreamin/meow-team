import { handleGitHubReplPost } from "@/lib/github-module/api";

export const runtime = "nodejs";

export const POST = handleGitHubReplPost;
