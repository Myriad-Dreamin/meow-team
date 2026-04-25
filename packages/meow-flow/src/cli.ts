import { Command } from "commander";
import { createRunCommand } from "./run-command.js";
import { resolveCliVersion } from "./version.js";
import { createWorktreeCommand } from "./worktree-command.js";

export function createCli(): Command {
  return new Command()
    .name("mfl")
    .description("CLI for launching MeowFlow agents in Paseo")
    .showSuggestionAfterError()
    .showHelpAfterError()
    .version(resolveCliVersion(), "-v, --version", "output the version number")
    .addCommand(createRunCommand())
    .addCommand(createWorktreeCommand());
}
