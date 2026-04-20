import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTeamRuntimeConfigAccessor, readTeamRuntimeConfig } from "./runtime";

const configPaths = {
  config: "/tmp/test-codex-config.toml",
  auth: "/tmp/test-codex-auth.json",
};

const createReadFile = (files: Record<string, string>): typeof readFileSync => {
  return ((filePath: string) => {
    const content = files[filePath];
    if (typeof content === "string") {
      return content;
    }

    const error = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }) as typeof readFileSync;
};

const createStatFile = (mtimes: Record<string, number>): typeof statSync => {
  return ((filePath: string) => {
    const mtimeMs = mtimes[filePath];
    if (typeof mtimeMs === "number") {
      return {
        mtimeMs,
      };
    }

    const error = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }) as typeof statSync;
};

describe("readTeamRuntimeConfig", () => {
  it("prefers Codex config and auth values over environment fallbacks", () => {
    const config = readTeamRuntimeConfig({
      env: {
        NODE_ENV: "test",
        OPENAI_API_KEY: "env-key",
        OPENAI_BASE_URL: "https://env.example.invalid",
        OPENAI_MODEL: "env-model",
        TEAM_OWNER_NAME: "Env Owner",
      },
      readFile: createReadFile({
        [configPaths.config]: `
model = "codex-model"
model_provider = "local"
model_reasoning_effort = "high"
model_verbosity = "low"

[model_providers.local]
base_url = "https://codex.example.invalid"
`,
        [configPaths.auth]: JSON.stringify({
          OPENAI_API_KEY: "auth-key",
        }),
      }),
      configPaths,
    });

    expect(config).toMatchObject({
      ownerName: "Env Owner",
      model: "codex-model",
      modelProvider: "local",
      reasoningEffort: "high",
      textVerbosity: "low",
      apiKey: "auth-key",
      baseUrl: "https://codex.example.invalid",
      hasApiKey: true,
      sources: {
        apiKey: "codex-auth",
        baseUrl: "codex-config",
        model: "codex-config",
      },
    });
  });

  it("falls back to environment values when Codex files are missing or invalid", () => {
    const config = readTeamRuntimeConfig({
      env: {
        NODE_ENV: "test",
        OPENAI_API_KEY: "env-key",
        OPENAI_BASE_URL: "https://env.example.invalid",
        OPENAI_MODEL: "env-model",
        TEAM_OWNER_NAME: "Env Owner",
      },
      readFile: createReadFile({
        [configPaths.auth]: JSON.stringify({
          OPENAI_API_KEY: 42,
        }),
      }),
      configPaths,
    });

    expect(config).toMatchObject({
      ownerName: "Env Owner",
      model: "env-model",
      modelProvider: null,
      reasoningEffort: "medium",
      textVerbosity: "medium",
      apiKey: "env-key",
      baseUrl: "https://env.example.invalid",
      hasApiKey: true,
      sources: {
        apiKey: "env",
        baseUrl: "env",
        model: "env",
      },
    });
  });
});

describe("createTeamRuntimeConfigAccessor", () => {
  it("reuses the cached snapshot when the config mtime is unchanged", () => {
    const files: Record<string, string> = {
      [configPaths.config]: `
model = "first-model"
model_provider = "local"

[model_providers.local]
base_url = "https://first.example.invalid"
`,
      [configPaths.auth]: JSON.stringify({
        OPENAI_API_KEY: "auth-key",
      }),
    };
    const mtimes: Record<string, number> = {
      [configPaths.config]: 10,
    };
    const getRuntimeConfig = createTeamRuntimeConfigAccessor({
      env: {
        NODE_ENV: "test",
      },
      readFile: createReadFile(files),
      statFile: createStatFile(mtimes),
      configPaths,
    });

    const first = getRuntimeConfig();
    files[configPaths.config] = `
model = "second-model"
model_provider = "local"

[model_providers.local]
base_url = "https://second.example.invalid"
`;

    const second = getRuntimeConfig();

    expect(second).toBe(first);
    expect(second.model).toBe("first-model");
    expect(second.baseUrl).toBe("https://first.example.invalid");
  });

  it("reloads the cached snapshot when the config mtime changes", () => {
    const files: Record<string, string> = {
      [configPaths.config]: `
model = "first-model"
model_provider = "local"

[model_providers.local]
base_url = "https://first.example.invalid"
`,
      [configPaths.auth]: JSON.stringify({
        OPENAI_API_KEY: "auth-key",
      }),
    };
    const mtimes: Record<string, number> = {
      [configPaths.config]: 10,
    };
    const getRuntimeConfig = createTeamRuntimeConfigAccessor({
      env: {
        NODE_ENV: "test",
      },
      readFile: createReadFile(files),
      statFile: createStatFile(mtimes),
      configPaths,
    });

    const first = getRuntimeConfig();
    files[configPaths.config] = `
model = "second-model"
model_provider = "local"

[model_providers.local]
base_url = "https://second.example.invalid"
`;
    mtimes[configPaths.config] = 11;

    const second = getRuntimeConfig();

    expect(second).not.toBe(first);
    expect(second.model).toBe("second-model");
    expect(second.baseUrl).toBe("https://second.example.invalid");
  });

  it("reloads after a missing config file later appears", () => {
    const files: Record<string, string> = {
      [configPaths.auth]: JSON.stringify({
        OPENAI_API_KEY: "auth-key",
      }),
    };
    const mtimes: Record<string, number> = {};
    const getRuntimeConfig = createTeamRuntimeConfigAccessor({
      env: {
        NODE_ENV: "test",
        OPENAI_MODEL: "env-model",
      },
      readFile: createReadFile(files),
      statFile: createStatFile(mtimes),
      configPaths,
    });

    const first = getRuntimeConfig();
    files[configPaths.config] = `
model = "codex-model"
model_provider = "local"

[model_providers.local]
base_url = "https://codex.example.invalid"
`;
    mtimes[configPaths.config] = 25;

    const second = getRuntimeConfig();

    expect(first.model).toBe("env-model");
    expect(second.model).toBe("codex-model");
    expect(second.baseUrl).toBe("https://codex.example.invalid");
  });
});
