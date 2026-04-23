import { Command } from "commander";
import { createMeowFlowTeamPlan } from "@myriaddreamin/meow-flow-core";
import { loadMeowFlowTeamConfig } from "./team-config.js";

type PlanCommandOptions = {
  readonly config?: string;
  readonly json?: boolean;
};

type PlanCommandJsonOutput = ReturnType<typeof buildPlanCommandJsonOutput>;

export function createPlanCommand(): Command {
  return new Command("plan")
    .description(
      "Load explicit or installed shared team config and print the resolved repository candidates plus worktree allocation plan",
    )
    .option(
      "-c, --config <path>",
      "load an explicit config path instead of the installed shared config",
    )
    .option("--json", "print machine-readable planning output")
    .action((options: PlanCommandOptions) => {
      const loadedConfig = loadMeowFlowTeamConfig({
        cwd: process.cwd(),
        configPath: options.config,
      });
      const plan = createMeowFlowTeamPlan(loadedConfig.config);
      const output = buildPlanCommandJsonOutput(loadedConfig, plan);

      process.stdout.write(
        options.json === true
          ? `${JSON.stringify(output, null, 2)}\n`
          : `${formatHumanReadablePlanOutput(output)}\n`,
      );
    });
}

function buildPlanCommandJsonOutput(
  loadedConfig: ReturnType<typeof loadMeowFlowTeamConfig>,
  plan: ReturnType<typeof createMeowFlowTeamPlan>,
) {
  return {
    configPath: loadedConfig.configPath,
    tsconfigPath: loadedConfig.tsconfigPath,
    notifications: loadedConfig.config.notifications,
    dispatch: loadedConfig.config.dispatch,
    repositoryCandidates: plan.repositoryCandidates,
    worktreeAllocations: plan.worktreeAllocations,
  };
}

function formatHumanReadablePlanOutput(output: PlanCommandJsonOutput): string {
  const lines = [
    `Config: ${output.configPath}`,
    ...(output.tsconfigPath === null ? [] : [`TypeScript context: ${output.tsconfigPath}`]),
    `Notifications: ${output.notifications.target}`,
    `Max concurrent workers: ${output.dispatch.maxConcurrentWorkers ?? "not set"}`,
    "Repositories:",
    ...output.repositoryCandidates.map(
      (repository) =>
        `${repository.priority + 1}. ${repository.label} (${repository.id}) -> ${repository.directory}`,
    ),
    "Worktree allocations:",
    ...output.worktreeAllocations.map(
      (allocation) =>
        `${allocation.priority + 1}. ${allocation.repositoryId}: ${allocation.worktreeParentDirectory} [theme=${allocation.worktreeTheme}, template=${allocation.worktreeNameTemplate}]`,
    ),
  ];

  return lines.join("\n");
}
