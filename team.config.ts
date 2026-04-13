import path from "node:path";
import { defineTeamConfig } from "@/lib/config/team";
import { teamRuntimeConfig } from "@/lib/config/runtime";

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
  storage: {
    threadFile: "data/meow-team.sqlite",
  },
  dispatch: {
    workerCount: 8,
    maxProposalCount: 6,
    branchPrefix: "team-dispatch",
    baseBranch: "main",
    worktreeRoot: ".meow-team-worktrees",
  },
  notifications: {
    target: "android",
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
