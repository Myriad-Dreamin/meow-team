import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(THIS_DIR, "..");
const TSX_LOADER_PATH = path.join(PACKAGE_ROOT, "node_modules", "tsx", "dist", "loader.mjs");
const CLI_ENTRY_PATH = path.join(PACKAGE_ROOT, "src", "index.ts");
const tempDirectories: string[] = [];

type CliRunResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly output: string;
};

afterEach(() => {
  while (tempDirectories.length > 0) {
    const nextDirectory = tempDirectories.pop();
    if (nextDirectory) {
      rmSync(nextDirectory, { recursive: true, force: true });
    }
  }
});

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

function writeFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function runCli(args: readonly string[], cwd: string): CliRunResult {
  const outputDirectory = createTempDirectory("meow-flow-plan-output-");
  const stdoutPath = path.join(outputDirectory, "stdout.txt");
  const stderrPath = path.join(outputDirectory, "stderr.txt");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");

  const result = spawnSync(
    process.execPath,
    ["--import", TSX_LOADER_PATH, CLI_ENTRY_PATH, ...args],
    {
      cwd,
      stdio: ["ignore", stdoutFd, stderrFd],
    },
  );

  closeSync(stdoutFd);
  closeSync(stderrFd);

  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");

  return {
    status: result.status,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
  };
}

describe("meow-flow plan", () => {
  test("fails clearly when team.config.ts cannot be discovered", () => {
    const workingDirectory = createTempDirectory("meow-flow-plan-missing-");
    const result = runCli(["plan"], workingDirectory);

    expect(result.status).toBe(1);
    expect(result.output).toContain("team.config.ts");
    expect(result.output).toContain("--config <path>");
  });

  test("discovers the nearest config, supports tsconfig path aliases, and emits stable JSON output", () => {
    const projectDirectory = createTempDirectory("meow-flow-plan-discovered-");
    const nestedDirectory = path.join(projectDirectory, "apps", "mobile");
    const backendDirectory = path.join(projectDirectory, "repos", "backend");
    const websiteDirectory = path.join(projectDirectory, "repos", "website");

    mkdirSync(nestedDirectory, { recursive: true });
    mkdirSync(backendDirectory, { recursive: true });
    mkdirSync(websiteDirectory, { recursive: true });

    writeFile(
      path.join(projectDirectory, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@/*": ["src/*"],
            },
          },
        },
        null,
        2,
      ),
    );

    writeFile(
      path.join(projectDirectory, "src", "team-data.ts"),
      `
export const notificationTarget = "vscode";

export const repositories = [
  {
    id: "backend",
    label: "Backend",
    directory: "./repos/backend",
    worktreeParentDirectory: ".team/worktrees",
    worktreeTheme: "backend-lane",
  },
  "./repos/website",
] as const;
      `.trimStart(),
    );

    writeFile(
      path.join(projectDirectory, "team.config.ts"),
      `
import { notificationTarget, repositories } from "@/team-data";

export default {
  notifications: {
    target: notificationTarget,
  },
  dispatch: {
    maxConcurrentWorkers: 3,
  },
  repositories,
};
      `.trimStart(),
    );

    const firstRun = runCli(["plan", "--json"], nestedDirectory);
    const secondRun = runCli(["plan", "--json"], nestedDirectory);

    expect(firstRun.status).toBe(0);
    expect(secondRun.status).toBe(0);
    expect(firstRun.stdout).toBe(secondRun.stdout);

    const payload = JSON.parse(firstRun.stdout) as {
      configPath: string;
      tsconfigPath: string | null;
      notifications: { target: string };
      dispatch: { maxConcurrentWorkers: number | null };
      repositoryCandidates: Array<{
        id: string;
        label: string;
        directory: string;
        priority: number;
      }>;
      worktreeAllocations: Array<{
        repositoryId: string;
        repositoryLabel: string;
        repositoryDirectory: string;
        worktreeParentDirectory: string;
        worktreeTheme: string;
        worktreeNameTemplate: string;
        priority: number;
      }>;
    };

    expect(payload.configPath).toBe(path.join(projectDirectory, "team.config.ts"));
    expect(payload.tsconfigPath).toBe(path.join(projectDirectory, "tsconfig.json"));
    expect(payload.notifications.target).toBe("vscode");
    expect(payload.dispatch.maxConcurrentWorkers).toBe(3);
    expect(payload.repositoryCandidates).toEqual([
      {
        id: "backend",
        label: "Backend",
        directory: backendDirectory,
        priority: 0,
      },
      {
        id: "website",
        label: "website",
        directory: websiteDirectory,
        priority: 1,
      },
    ]);
    expect(payload.worktreeAllocations).toEqual([
      {
        repositoryId: "backend",
        repositoryLabel: "Backend",
        repositoryDirectory: backendDirectory,
        worktreeParentDirectory: path.join(backendDirectory, ".team", "worktrees"),
        worktreeTheme: "backend-lane",
        worktreeNameTemplate: "backend-lane-{assignment}",
        priority: 0,
      },
      {
        repositoryId: "website",
        repositoryLabel: "website",
        repositoryDirectory: websiteDirectory,
        worktreeParentDirectory: path.join(websiteDirectory, ".paseo", "worktrees"),
        worktreeTheme: "website",
        worktreeNameTemplate: "website-{assignment}",
        priority: 1,
      },
    ]);
  });

  test("prefers an explicit --config path over discovery", () => {
    const workspaceDirectory = createTempDirectory("meow-flow-plan-explicit-");
    const outerConfigDirectory = path.join(workspaceDirectory, "outer");
    const innerConfigDirectory = path.join(workspaceDirectory, "inner");
    const nestedDirectory = path.join(innerConfigDirectory, "nested");

    mkdirSync(path.join(outerConfigDirectory, "repos", "outer"), { recursive: true });
    mkdirSync(path.join(innerConfigDirectory, "repos", "inner"), { recursive: true });
    mkdirSync(nestedDirectory, { recursive: true });

    writeFile(
      path.join(outerConfigDirectory, "team.config.ts"),
      `
export default {
  repositories: [
    {
      id: "outer",
      directory: "./repos/outer",
    },
  ],
};
      `.trimStart(),
    );

    writeFile(
      path.join(innerConfigDirectory, "team.config.ts"),
      `
export default {
  repositories: [
    {
      id: "inner",
      directory: "./repos/inner",
    },
  ],
};
      `.trimStart(),
    );

    const result = runCli(
      ["plan", "--config", path.join(outerConfigDirectory, "team.config.ts"), "--json"],
      nestedDirectory,
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      configPath: string;
      repositoryCandidates: Array<{ id: string }>;
    };

    expect(payload.configPath).toBe(path.join(outerConfigDirectory, "team.config.ts"));
    expect(payload.repositoryCandidates.map((repository) => repository.id)).toEqual(["outer"]);
  });

  test("reports field-specific validation errors for invalid config", () => {
    const workingDirectory = createTempDirectory("meow-flow-plan-invalid-");

    writeFile(
      path.join(workingDirectory, "team.config.ts"),
      `
export default {
  notifications: {
    target: "pager",
  },
  repositories: [
    {
      directory: 123,
    },
  ],
};
      `.trimStart(),
    );

    const result = runCli(["plan"], workingDirectory);

    expect(result.status).toBe(1);
    expect(result.output).toContain("notifications.target");
    expect(result.output).toContain("repositories[0].directory");
  });
});
