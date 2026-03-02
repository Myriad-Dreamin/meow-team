import {
  handleGitHubAchievementsGet,
  handleGitHubAchievementsPost,
} from "@/lib/github-module/api";

export const runtime = "nodejs";

export const GET = handleGitHubAchievementsGet;
export const POST = handleGitHubAchievementsPost;
