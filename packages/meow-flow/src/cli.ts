import { Command } from "commander";
import { createConfigCommand } from "./config-command.js";
import { createDeleteCommand } from "./delete-command.js";
import { createPlanCommand } from "./plan-command.js";
import { createRunCommand } from "./run-command.js";
import { createThreadCommand, createThreadListCommand } from "./thread-command.js";
import { resolveCliVersion } from "./version.js";

export function createCli(): Command {
  return new Command()
    .name("meow-flow")
    .description("CLI for loading Meow Flow team config and planning repository dispatch")
    .showSuggestionAfterError()
    .showHelpAfterError()
    .version(resolveCliVersion(), "-v, --version", "output the version number")
    .addCommand(createConfigCommand())
    .addCommand(createPlanCommand())
    .addCommand(createThreadCommand())
    .addCommand(createThreadListCommand({ commandName: "meow-flow ls" }))
    .addCommand(createRunCommand())
    .addCommand(createDeleteCommand());
}
