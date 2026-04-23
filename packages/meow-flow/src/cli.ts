import { Command } from "commander";
import { createPlanCommand } from "./plan-command.js";
import { resolveCliVersion } from "./version.js";

export function createCli(): Command {
  return new Command()
    .name("meow-flow")
    .description("CLI for loading Meow Flow team config and planning repository dispatch")
    .showSuggestionAfterError()
    .showHelpAfterError()
    .version(resolveCliVersion(), "-v, --version", "output the version number")
    .addCommand(createPlanCommand());
}
