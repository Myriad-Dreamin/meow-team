import { pathToFileURL } from "node:url";

type TeamConfigModule = {
  readonly default?: unknown;
  readonly teamConfig?: unknown;
};

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error("Expected a config path argument.");
  }

  const loadedModule = (await import(pathToFileURL(configPath).href)) as TeamConfigModule;
  const config = extractTeamConfig(loadedModule);
  const serializedConfig = JSON.stringify(config);

  if (serializedConfig === undefined) {
    throw new Error(
      "Team config must export a JSON-serializable object via default export or named export `teamConfig`.",
    );
  }

  process.stdout.write(serializedConfig);
}

function extractTeamConfig(moduleExports: TeamConfigModule): unknown {
  if ("default" in moduleExports && moduleExports.default !== undefined) {
    return moduleExports.default;
  }

  if ("teamConfig" in moduleExports && moduleExports.teamConfig !== undefined) {
    return moduleExports.teamConfig;
  }

  throw new Error(
    "Team config module must export a default config object or named export `teamConfig`.",
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
