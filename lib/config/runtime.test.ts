import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readTeamRuntimeConfig } from "./runtime";

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

describe("readTeamRuntimeConfig", () => {
  it("prefers Codex config and auth values over environment fallbacks", () => {
    const config = readTeamRuntimeConfig({
      env: {
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
