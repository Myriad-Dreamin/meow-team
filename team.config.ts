import { defineTeamConfig } from "@/lib/team/config";

export const teamConfig = defineTeamConfig({
  id: "owner-harness-team",
  name: "Owner Harness Team",
  owner: {
    name: process.env.TEAM_OWNER_NAME ?? "Your Team",
    objective:
      "Continuously turn product requests into planned, implemented, and reviewed engineering work.",
  },
  model: {
    provider: "openai",
    model: process.env.OPENAI_MODEL ?? "gpt-5.2-codex",
    reasoningEffort: "medium",
    textVerbosity: "medium",
    maxOutputTokens: 3200,
  },
  workflow: ["planner", "coder", "reviewer"],
  maxIterations: 10,
  storage: {
    threadFile: "data/team-threads.json",
  },
});
