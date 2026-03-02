import {
  handleGitHubTasksGet,
  handleGitHubTasksPost,
} from "@/lib/github-module/api";

export const runtime = "nodejs";

export const GET = handleGitHubTasksGet;
export const POST = handleGitHubTasksPost;
