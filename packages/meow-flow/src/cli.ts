import { Command } from "commander";
import { createAgentCommand } from "./agent-command.js";
import { createConfigCommand } from "./config-command.js";
import { createHandoffCommand } from "./handoff-command.js";
import { createInstallSkillsCommand } from "./install-skills-command.js";
import { createRunCommand } from "./run-command.js";
import { createStatusCommand } from "./status-command.js";
import { createThreadCommand } from "./thread-command.js";
import { resolveCliVersion } from "./version.js";
import { createWorktreeCommand } from "./worktree-command.js";

export function createCli(): Command {
  return new Command()
    .name("mfl")
    .description("CLI for launching MeowFlow agents in Paseo")
    .showSuggestionAfterError()
    .showHelpAfterError()
    .version(resolveCliVersion(), "-v, --version", "output the version number")
    .addCommand(createStatusCommand())
    .addCommand(createInstallSkillsCommand())
    .addCommand(createRunCommand())
    .addCommand(createThreadCommand())
    .addCommand(createAgentCommand())
    .addCommand(createHandoffCommand())
    .addCommand(createConfigCommand())
    .addCommand(createWorktreeCommand());
}
