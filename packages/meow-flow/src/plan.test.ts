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

type PlanJsonOutput = {
  readonly configPath: string;
  readonly tsconfigPath: string | null;
  readonly notifications: { readonly target: string };
  readonly dispatch: { readonly maxConcurrentWorkers: number | null };
  readonly repositoryCandidates: Array<{
    readonly id: string;
    readonly label: string;
    readonly directory: string;
    readonly priority: number;
  }>;
  readonly worktreeAllocations: Array<{
    readonly repositoryId: string;
    readonly repositoryLabel: string;
    readonly repositoryDirectory: string;
    readonly worktreeParentDirectory: string;
    readonly worktreeTheme: string;
    readonly worktreeNameTemplate: string;
    readonly priority: number;
  }>;
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

function runCli(
  args: readonly string[],
  cwd: string,
  options: { readonly env?: NodeJS.ProcessEnv } = {},
): CliRunResult {
  const outputDirectory = createTempDirectory("meow-flow-plan-output-");
  const stdoutPath = path.join(outputDirectory, "stdout.txt");
  const stderrPath = path.join(outputDirectory, "stderr.txt");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");

  const result = spawnSync(
    process.execPath,
    ["--conditions=source", "--import", TSX_LOADER_PATH, CLI_ENTRY_PATH, ...args],
    {
      cwd,
      env: {
        ...process.env,
        ...options.env,
      },
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

function testHomeEnv(homeDirectory: string): NodeJS.ProcessEnv {
  return {
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
  };
}

function sharedConfigPath(homeDirectory: string): string {
  return path.join(homeDirectory, ".local", "shared", "meow-flow", "config.js");
}

function parsePlanJson(result: CliRunResult): PlanJsonOutput {
  return JSON.parse(result.stdout) as PlanJsonOutput;
}

describe("mfl config install and plan", () => {
  test("installs a TypeScript config as portable shared JavaScript and uses it by default", () => {
    const homeDirectory = createTempDirectory("meow-flow-home-ts-install-");
    const env = testHomeEnv(homeDirectory);
    const projectDirectory = createTempDirectory("meow-flow-plan-installed-ts-");
    const nestedDirectory = path.join(projectDirectory, "apps", "mobile");
    const backendDirectory = path.join(projectDirectory, "repos", "backend");
    const websiteDirectory = path.join(projectDirectory, "repos", "website");

    writeFile(path.join(homeDirectory, "package.json"), '{\n  "type": "module"\n}\n');
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

    const sourceConfigPath = path.join(projectDirectory, "team.config.ts");

    writeFile(
      sourceConfigPath,
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

    const installResult = runCli(["config", "install", sourceConfigPath], projectDirectory, {
      env,
    });

    expect(installResult.status).toBe(0);
    expect(installResult.output).toContain("Installed shared Meow Flow config");
    expect(installResult.output).toContain(path.join(projectDirectory, "tsconfig.json"));

    const installedConfigPath = sharedConfigPath(homeDirectory);
    const installedConfig = readFileSync(installedConfigPath, "utf8");

    expect(installedConfig).toContain("module.exports =");
    expect(installedConfig).toContain(backendDirectory);
    expect(installedConfig).toContain(websiteDirectory);
    expect(installedConfig).not.toContain("@/team-data");

    rmSync(sourceConfigPath, { force: true });
    rmSync(path.join(projectDirectory, "src"), { recursive: true, force: true });

    const firstRun = runCli(["plan", "--json"], nestedDirectory, { env });
    const secondRun = runCli(["plan", "--json"], createTempDirectory("meow-flow-other-cwd-"), {
      env,
    });

    expect(firstRun.status).toBe(0);
    expect(secondRun.status).toBe(0);
    expect(firstRun.stdout).toBe(secondRun.stdout);

    const payload = parsePlanJson(firstRun);

    expect(payload.configPath).toBe(installedConfigPath);
    expect(payload.tsconfigPath).toBeNull();
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

  test("installs JavaScript configs and overwrites the shared artifact", () => {
    const homeDirectory = createTempDirectory("meow-flow-home-js-install-");
    const env = testHomeEnv(homeDirectory);
    const workspaceDirectory = createTempDirectory("meow-flow-js-install-");
    const firstProjectDirectory = path.join(workspaceDirectory, "first");
    const secondProjectDirectory = path.join(workspaceDirectory, "second");
    const firstRepositoryDirectory = path.join(firstProjectDirectory, "repos", "first");
    const secondRepositoryDirectory = path.join(secondProjectDirectory, "repos", "second");

    mkdirSync(firstRepositoryDirectory, { recursive: true });
    mkdirSync(secondRepositoryDirectory, { recursive: true });

    const firstConfigPath = path.join(firstProjectDirectory, "team.config.js");
    const secondConfigPath = path.join(secondProjectDirectory, "team.config.js");

    writeFile(
      firstConfigPath,
      `
module.exports = {
  notifications: {
    target: "browser",
  },
  repositories: [
    {
      id: "first",
      directory: "./repos/first",
    },
  ],
};
      `.trimStart(),
    );

    writeFile(
      secondConfigPath,
      `
module.exports = {
  notifications: {
    target: "android",
  },
  repositories: [
    {
      id: "second",
      directory: "./repos/second",
    },
  ],
};
      `.trimStart(),
    );

    const firstInstall = runCli(["config", "install", firstConfigPath], firstProjectDirectory, {
      env,
    });
    const secondInstall = runCli(["config", "install", secondConfigPath], secondProjectDirectory, {
      env,
    });

    expect(firstInstall.status).toBe(0);
    expect(secondInstall.status).toBe(0);
    expect(secondInstall.output).toContain("Overwrote existing shared config.");

    const installedConfig = readFileSync(sharedConfigPath(homeDirectory), "utf8");

    expect(installedConfig).toContain(secondRepositoryDirectory);
    expect(installedConfig).not.toContain(firstRepositoryDirectory);

    const planResult = runCli(["plan", "--json"], workspaceDirectory, { env });

    expect(planResult.status).toBe(0);
    expect(parsePlanJson(planResult).repositoryCandidates).toEqual([
      {
        id: "second",
        label: "second",
        directory: secondRepositoryDirectory,
        priority: 0,
      },
    ]);
  });

  test("rejects unsupported config extensions without overwriting the shared artifact", () => {
    const homeDirectory = createTempDirectory("meow-flow-home-unsupported-");
    const env = testHomeEnv(homeDirectory);
    const projectDirectory = createTempDirectory("meow-flow-unsupported-config-");
    const unsupportedConfigPath = path.join(projectDirectory, "team.config.mjs");
    const installedConfigPath = sharedConfigPath(homeDirectory);
    const existingConfig =
      'module.exports = { repositories: [{ id: "existing", directory: "/tmp/existing" }] };\n';

    writeFile(installedConfigPath, existingConfig);
    writeFile(
      unsupportedConfigPath,
      `
export default {
  repositories: [
    {
      id: "unsupported",
      directory: ".",
    },
  ],
};
      `.trimStart(),
    );

    const result = runCli(["config", "install", unsupportedConfigPath], projectDirectory, {
      env,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain(".js");
    expect(result.output).toContain(".ts");
    expect(readFileSync(installedConfigPath, "utf8")).toBe(existingConfig);
  });

  test("prefers an explicit --config path over the shared config", () => {
    const homeDirectory = createTempDirectory("meow-flow-home-explicit-");
    const env = testHomeEnv(homeDirectory);
    const workspaceDirectory = createTempDirectory("meow-flow-plan-explicit-");
    const explicitConfigDirectory = path.join(workspaceDirectory, "explicit");
    const nestedDirectory = path.join(explicitConfigDirectory, "nested");
    const explicitRepositoryDirectory = path.join(explicitConfigDirectory, "repos", "explicit");

    mkdirSync(nestedDirectory, { recursive: true });
    mkdirSync(explicitRepositoryDirectory, { recursive: true });
    writeFile(
      sharedConfigPath(homeDirectory),
      "throw new Error('shared config should not load');\n",
    );

    const explicitConfigPath = path.join(explicitConfigDirectory, "team.config.ts");

    writeFile(
      explicitConfigPath,
      `
export default {
  repositories: [
    {
      id: "explicit",
      directory: "./repos/explicit",
    },
  ],
};
      `.trimStart(),
    );

    const result = runCli(["plan", "--config", explicitConfigPath, "--json"], nestedDirectory, {
      env,
    });

    expect(result.status).toBe(0);
    const payload = parsePlanJson(result);

    expect(payload.configPath).toBe(explicitConfigPath);
    expect(payload.repositoryCandidates.map((repository) => repository.id)).toEqual(["explicit"]);
  });

  test("fails without local discovery when the shared config is missing", () => {
    const homeDirectory = createTempDirectory("meow-flow-home-missing-");
    const env = testHomeEnv(homeDirectory);
    const workingDirectory = createTempDirectory("meow-flow-plan-missing-");

    writeFile(
      path.join(workingDirectory, "team.config.ts"),
      `
export default {
  repositories: [
    {
      id: "local",
      directory: ".",
    },
  ],
};
      `.trimStart(),
    );

    const result = runCli(["plan"], workingDirectory, { env });

    expect(result.status).toBe(1);
    expect(result.output).toContain(sharedConfigPath(homeDirectory));
    expect(result.output).toContain("mfl config install <path>");
  });

  test("reports field-specific validation errors for invalid explicit config", () => {
    const homeDirectory = createTempDirectory("meow-flow-home-invalid-");
    const env = testHomeEnv(homeDirectory);
    const workingDirectory = createTempDirectory("meow-flow-plan-invalid-");
    const configPath = path.join(workingDirectory, "team.config.ts");

    writeFile(
      configPath,
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

    const result = runCli(["plan", "--config", configPath], workingDirectory, { env });

    expect(result.status).toBe(1);
    expect(result.output).toContain("notifications.target");
    expect(result.output).toContain("repositories[0].directory");
  });
});
