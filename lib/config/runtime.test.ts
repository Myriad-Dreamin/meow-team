import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertTeamCodexAuthFileExists,
  createTeamRuntimeConfigAccessor,
  missingCodexAuthMessage,
  readTeamRuntimeConfig,
} from "./runtime";

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
  it("prefers Codex config values over environment fallbacks", () => {
    const config = readTeamRuntimeConfig({
      env: {
        NODE_ENV: "test",
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
      }),
      configPaths,
    });

    expect(config).toMatchObject({
      ownerName: "Env Owner",
      model: "codex-model",
      modelProvider: "local",
      reasoningEffort: "high",
      textVerbosity: "low",
      baseUrl: "https://codex.example.invalid",
      sources: {
        baseUrl: "codex-config",
        model: "codex-config",
      },
    });
  });

  it("falls back to environment values when the Codex config is missing", () => {
    const config = readTeamRuntimeConfig({
      env: {
        NODE_ENV: "test",
        OPENAI_BASE_URL: "https://env.example.invalid",
        OPENAI_MODEL: "env-model",
        TEAM_OWNER_NAME: "Env Owner",
      },
      readFile: createReadFile({}),
      configPaths,
    });

    expect(config).toMatchObject({
      ownerName: "Env Owner",
      model: "env-model",
      modelProvider: null,
      reasoningEffort: "medium",
      textVerbosity: "medium",
      baseUrl: "https://env.example.invalid",
      sources: {
        baseUrl: "env",
        model: "env",
      },
    });
  });
});

describe("assertTeamCodexAuthFileExists", () => {
  it("accepts an existing Codex auth file without inspecting its auth mode", () => {
    expect(() =>
      assertTeamCodexAuthFileExists({
        readFile: createReadFile({
          [configPaths.auth]: JSON.stringify({
            auth_mode: "oauth",
            refresh_token: "refresh-token",
          }),
        }),
        configPaths,
      }),
    ).not.toThrow();
  });

  it("throws the backend auth-file error when the Codex auth file is missing", () => {
    expect(() =>
      assertTeamCodexAuthFileExists({
        readFile: createReadFile({}),
        configPaths,
      }),
    ).toThrow(missingCodexAuthMessage);
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
    const files: Record<string, string> = {};
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
