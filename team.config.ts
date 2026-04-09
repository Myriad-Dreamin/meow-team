import path from "node:path";
import { defineTeamConfig } from "@/lib/team/config";
import { teamRuntimeConfig } from "@/lib/team/runtime-config";

export const teamConfig = defineTeamConfig({
  id: "owner-harness-team",
  name: "Owner Harness Team",
  owner: {
    name: teamRuntimeConfig.ownerName,
    objective:
      "Continuously turn product requests into planned, implemented, and reviewed engineering work.",
  },
  model: {
    provider: "openai",
    model: teamRuntimeConfig.model,
    reasoningEffort: teamRuntimeConfig.reasoningEffort,
    textVerbosity: teamRuntimeConfig.textVerbosity,
    maxOutputTokens: 3200,
  },
  workflow: ["planner", "coder", "reviewer"],
  maxIterations: 10,
  storage: {
    threadFile: "data/team-threads.json",
  },
  dispatch: {
    workerCount: 3,
    branchPrefix: "team-dispatch",
    baseBranch: "main",
    worktreeRoot: ".meow-team-worktrees",
  },
  repositories: {
    roots: [
      {
        id: "work-ts",
        label: "Typescript",
        directory: path.resolve(process.cwd(), ".."),
      },
      {
        id: "work-rust",
        label: "Rust",
        directory: path.resolve(process.cwd(), "../../rust"),
      },
      {
        id: "revival",
        label: "Revival Projects",
        directory: "/mnt/sda2/revival/",
      },
    ],
  },
});
