import {
  handleGitHubEventsGet,
  handleGitHubEventsPost,
} from "@/lib/github-module/api";

export const runtime = "nodejs";

export const GET = handleGitHubEventsGet;
export const POST = handleGitHubEventsPost;
