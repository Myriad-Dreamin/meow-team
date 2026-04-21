import { createRequire } from "node:module";
import { Builtins, Cli, type BaseContext } from "clipanion";
import { ConfigCommand } from "./commands/config.ts";
import { ConfigPlatformCommand } from "./commands/config-platform.ts";
import { ConfigUgitBaseUrlCommand } from "./commands/config-ugit-base-url.ts";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as {
  version?: string;
};

export type MeowTeamCliContext = BaseContext & {
  cwd: string;
};

const meowTeamCommands = [
  ConfigCommand,
  ConfigPlatformCommand,
  ConfigUgitBaseUrlCommand,
  Builtins.HelpCommand,
  Builtins.VersionCommand,
];

export const createMeowTeamCli = (): Cli<MeowTeamCliContext> => {
  return Cli.from<MeowTeamCliContext>(meowTeamCommands, {
    binaryLabel: "Meow Team",
    binaryName: "meow-team",
    binaryVersion: packageJson.version,
  });
};

export const runMeowTeamCli = async (
  argv: string[],
  context: Partial<MeowTeamCliContext> = {},
): Promise<number> => {
  const cli = createMeowTeamCli();
  return cli.run(argv, {
    ...Cli.defaultContext,
    cwd: process.cwd(),
    ...context,
  });
};

export const runMeowTeamCliExit = async (
  argv: string[],
  context: Partial<MeowTeamCliContext> = {},
): Promise<void> => {
  const cli = createMeowTeamCli();
  await cli.runExit(argv, {
    ...Cli.defaultContext,
    cwd: process.cwd(),
    ...context,
  });
};
