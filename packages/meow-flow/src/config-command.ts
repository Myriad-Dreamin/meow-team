import { Command } from "commander";
import { setConfiguredRunProvider } from "./run-config.js";

export function createConfigCommand(): Command {
  return new Command("config")
    .description("Read and update MeowFlow configuration")
    .addCommand(createConfigSetCommand());
}

function createConfigSetCommand(): Command {
  return new Command("set")
    .description("Set MeowFlow configuration values")
    .addCommand(createConfigSetProviderCommand());
}

function createConfigSetProviderCommand(): Command {
  return new Command("provider")
    .description("Set the default Paseo provider for mfl run")
    .argument("<provider-name>", "Paseo provider or provider/model name")
    .action((providerName: string, _options: unknown, command: Command) => {
      try {
        const result = setConfiguredRunProvider(providerName);

        process.stdout.write(`provider: ${result.provider}\n`);
        process.stdout.write(`config: ${result.configPath}\n`);
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}
