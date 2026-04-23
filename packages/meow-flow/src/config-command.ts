import { Command } from "commander";
import {
  installSharedMeowFlowTeamConfig,
  type SharedConfigInstallResult,
} from "./config-install.js";
import {
  formatSupportedTeamConfigSourceExtensions,
  SHARED_MEOW_FLOW_CONFIG_DISPLAY_PATH,
} from "./shared-config.js";

export function createConfigCommand(): Command {
  return new Command("config")
    .description("Manage the shared Meow Flow config")
    .addCommand(createConfigInstallCommand());
}

function createConfigInstallCommand(): Command {
  return new Command("install")
    .argument(
      "<path>",
      `path to a team config source (${formatSupportedTeamConfigSourceExtensions()})`,
    )
    .description(`Install a team config to ${SHARED_MEOW_FLOW_CONFIG_DISPLAY_PATH}`)
    .action((sourceConfigPath: string) => {
      const result = installSharedMeowFlowTeamConfig({
        cwd: process.cwd(),
        sourceConfigPath,
      });

      process.stdout.write(formatInstallSuccess(result));
    });
}

function formatInstallSuccess(result: SharedConfigInstallResult): string {
  const lines = [
    `Installed shared Meow Flow config to ${result.installedConfigPath}.`,
    ...(result.didOverwrite ? ["Overwrote existing shared config."] : []),
    `Source: ${result.sourceConfigPath}`,
    ...(result.tsconfigPath === null ? [] : [`TypeScript context: ${result.tsconfigPath}`]),
    "Re-run this command after moving the source repository so absolute paths stay current.",
  ];

  return `${lines.join("\n")}\n`;
}
