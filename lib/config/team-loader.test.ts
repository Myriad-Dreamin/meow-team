import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getTeamConfig,
  resetTeamConfigLoaderForTests,
  resolveTeamConfigPath,
  setTeamConfigLoaderOverridesForTests,
} from "./team-loader";

const renderTeamConfig = ({ id, workerCount }: { id: string; workerCount: number }) => {
  return `
import { defineTeamConfig } from "@/lib/config/team";

export const teamConfig = defineTeamConfig({
  id: "${id}",
  name: "Team ${id}",
  owner: {
    name: "Owner",
    objective: "Ship reliable delivery.",
  },
  model: {
    provider: "openai",
    model: "gpt-5",
    reasoningEffort: "medium",
    textVerbosity: "medium",
    maxOutputTokens: 3200,
  },
  workflow: ["planner", "coder", "reviewer"],
  storage: {
    threadFile: "/tmp/${id}.sqlite",
  },
  dispatch: {
    workerCount: ${workerCount},
    maxProposalCount: 6,
    branchPrefix: "team-dispatch",
    baseBranch: "main",
    worktreeRoot: ".worktrees",
  },
  notifications: {
    target: "browser",
  },
  repositories: {
    roots: [
      {
        id: "repo-root",
        label: "Repo Root",
        directory: "/tmp",
      },
    ],
  },
});
`;
};

const writeTeamConfigFile = async ({
  configPath,
  id,
  workerCount,
  mtimeMs,
}: {
  configPath: string;
  id: string;
  workerCount: number;
  mtimeMs: number;
}): Promise<void> => {
  await mkdir(path.dirname(configPath), {
    recursive: true,
  });
  await writeFile(configPath, renderTeamConfig({ id, workerCount }), "utf8");
  const timestamp = new Date(mtimeMs);
  await utimes(configPath, timestamp, timestamp);
};

describe("getTeamConfig", () => {
  let tempDirectory: string;
  let mtimeMs: number;

  beforeEach(async () => {
    resetTeamConfigLoaderForTests();
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "team-config-loader-"));
    mtimeMs = Date.now();
  });

  afterEach(async () => {
    resetTeamConfigLoaderForTests();
    await rm(tempDirectory, {
      force: true,
      recursive: true,
    });
  });

  it("loads team.config.ts from the default cwd path", async () => {
    const configPath = path.join(tempDirectory, "team.config.ts");
    await writeTeamConfigFile({
      configPath,
      id: "default-team",
      workerCount: 2,
      mtimeMs,
    });
    setTeamConfigLoaderOverridesForTests({
      cwd: tempDirectory,
    });

    const config = getTeamConfig();

    expect(resolveTeamConfigPath()).toBe(configPath);
    expect(config.id).toBe("default-team");
    expect(config.dispatch.workerCount).toBe(2);
    expect(getTeamConfig()).toBe(config);
  });

  it("honors REVIVAL_TEAM_CONFIG_PATH overrides", async () => {
    const defaultPath = path.join(tempDirectory, "team.config.ts");
    const overridePath = path.join(tempDirectory, "config", "custom-team.config.ts");
    await writeTeamConfigFile({
      configPath: defaultPath,
      id: "default-team",
      workerCount: 2,
      mtimeMs,
    });
    await writeTeamConfigFile({
      configPath: overridePath,
      id: "override-team",
      workerCount: 5,
      mtimeMs: mtimeMs + 1_000,
    });
    setTeamConfigLoaderOverridesForTests({
      cwd: tempDirectory,
      envConfigPath: "config/custom-team.config.ts",
    });

    const config = getTeamConfig();

    expect(resolveTeamConfigPath()).toBe(overridePath);
    expect(config.id).toBe("override-team");
    expect(config.dispatch.workerCount).toBe(5);
  });

  it("reloads when the config mtime changes", async () => {
    const configPath = path.join(tempDirectory, "team.config.ts");
    await writeTeamConfigFile({
      configPath,
      id: "first-team",
      workerCount: 1,
      mtimeMs,
    });
    setTeamConfigLoaderOverridesForTests({
      cwd: tempDirectory,
    });

    const first = getTeamConfig();

    await writeTeamConfigFile({
      configPath,
      id: "second-team",
      workerCount: 4,
      mtimeMs: mtimeMs + 1_000,
    });

    const second = getTeamConfig();

    expect(second).not.toBe(first);
    expect(second.id).toBe("second-team");
    expect(second.dispatch.workerCount).toBe(4);
  });

  it("reloads after a missing config file later appears", async () => {
    setTeamConfigLoaderOverridesForTests({
      cwd: tempDirectory,
    });

    expect(() => getTeamConfig()).toThrow(
      `Team config file was not found at ${path.join(tempDirectory, "team.config.ts")}.`,
    );

    await writeTeamConfigFile({
      configPath: path.join(tempDirectory, "team.config.ts"),
      id: "appeared-team",
      workerCount: 3,
      mtimeMs,
    });

    const config = getTeamConfig();

    expect(config.id).toBe("appeared-team");
    expect(config.dispatch.workerCount).toBe(3);
  });

  it("does not keep serving stale config after removal", async () => {
    const configPath = path.join(tempDirectory, "team.config.ts");
    await writeTeamConfigFile({
      configPath,
      id: "before-removal",
      workerCount: 2,
      mtimeMs,
    });
    setTeamConfigLoaderOverridesForTests({
      cwd: tempDirectory,
    });

    expect(getTeamConfig().id).toBe("before-removal");

    await rm(configPath, {
      force: true,
    });

    expect(() => getTeamConfig()).toThrow(`Team config file was not found at ${configPath}.`);
  });
});
