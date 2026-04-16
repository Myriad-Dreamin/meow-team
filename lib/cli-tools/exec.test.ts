import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

const completeCommand = ({
  error = null,
  stdout = "",
  stderr = "",
}: {
  error?: Error | null;
  stdout?: string;
  stderr?: string;
}): void => {
  execFileMock.mockImplementation(
    (_command: string, _args: string[], _options: object, callback: ExecFileCallback) => {
      callback(error, stdout, stderr);
    },
  );
};

const loadModules = async () => {
  const [{ execCliCommand }, { runGit }, { runGh }, { runOpenSpec }] = await Promise.all([
    import("@/lib/cli-tools/exec"),
    import("@/lib/cli-tools/git"),
    import("@/lib/platform/gh/cli"),
    import("@/lib/cli-tools/openspec"),
  ]);

  return {
    execCliCommand,
    runGit,
    runGh,
    runOpenSpec,
  };
};

afterEach(() => {
  execFileMock.mockReset();
  vi.unstubAllEnvs();
});

describe("execCliCommand", () => {
  it("trims stdout and stderr for successful commands", async () => {
    const { execCliCommand } = await loadModules();
    completeCommand({
      stdout: "  ok  \n",
      stderr: "  warning  \n",
    });

    await expect(
      execCliCommand({
        command: "tool",
        args: ["status"],
        failureMessage: "tool failed",
      }),
    ).resolves.toEqual({
      stdout: "ok",
      stderr: "warning",
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "tool",
      ["status"],
      {
        maxBuffer: 1024 * 1024 * 4,
      },
      expect.any(Function),
    );
  });

  it("prefers stderr and stdout output over the fallback failure message", async () => {
    const { execCliCommand } = await loadModules();
    completeCommand({
      error: new Error("failed"),
      stdout: "  partial stdout  ",
      stderr: "  fatal stderr  ",
    });

    await expect(
      execCliCommand({
        command: "tool",
        args: ["status"],
        failureMessage: "tool failed",
      }),
    ).rejects.toThrow("fatal stderr\npartial stdout");
  });

  it("falls back to the provided failure message when the command returns no output", async () => {
    const { execCliCommand } = await loadModules();
    completeCommand({
      error: new Error("failed"),
    });

    await expect(
      execCliCommand({
        command: "tool",
        args: ["status"],
        failureMessage: "tool failed",
      }),
    ).rejects.toThrow("tool failed");
  });
});

describe("runGit", () => {
  it("runs git with -C against the target repository", async () => {
    const { runGit } = await loadModules();
    vi.stubEnv(
      "PATH",
      ["/usr/bin", "./node_modules/.bin", "/repo/node_modules/.bin", "/custom/tools"].join(
        path.delimiter,
      ),
    );
    vi.stubEnv("MEOW_TEST_ENV", "set");
    completeCommand({
      stdout: "clean",
    });

    await expect(runGit("/repo", ["status", "--short"])).resolves.toEqual({
      stdout: "clean",
      stderr: "",
    });

    const options = execFileMock.mock.calls[0]?.[2] as {
      env?: NodeJS.ProcessEnv;
      maxBuffer?: number;
    };

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["-C", "/repo", "status", "--short"],
      expect.objectContaining({
        env: expect.objectContaining({
          MEOW_TEST_ENV: "set",
        }),
        maxBuffer: 1024 * 1024 * 4,
      }),
      expect.any(Function),
    );
    expect(options.env?.PATH?.split(path.delimiter)).toEqual(["/usr/bin", "/custom/tools"]);
  });

  it("preserves the git fallback failure message", async () => {
    const { runGit } = await loadModules();
    completeCommand({
      error: new Error("failed"),
    });

    await expect(runGit("/repo", ["status"])).rejects.toThrow(
      "Git command failed in /repo: git status",
    );
  });
});

describe("runGh", () => {
  it("runs gh in the repository working directory", async () => {
    const { runGh } = await loadModules();
    completeCommand({
      stdout: "[]",
    });

    await expect(runGh("/repo", ["pr", "list"])).resolves.toEqual({
      stdout: "[]",
      stderr: "",
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "gh",
      ["pr", "list"],
      {
        cwd: "/repo",
        maxBuffer: 1024 * 1024 * 4,
      },
      expect.any(Function),
    );
  });
});

describe("runOpenSpec", () => {
  it("disables telemetry and runs in the requested working directory", async () => {
    const { runOpenSpec } = await loadModules();
    vi.stubEnv("MEOW_TEST_ENV", "set");
    completeCommand({
      stdout: "{}",
    });

    await expect(runOpenSpec("/repo", ["status", "--json"])).resolves.toEqual({
      stdout: "{}",
      stderr: "",
    });

    const options = execFileMock.mock.calls[0]?.[2] as {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      maxBuffer?: number;
    };

    expect(options.cwd).toBe("/repo");
    expect(options.maxBuffer).toBe(1024 * 1024 * 4);
    expect(options.env?.MEOW_TEST_ENV).toBe("set");
    expect(options.env?.OPENSPEC_TELEMETRY).toBe("0");
  });

  it("preserves the OpenSpec fallback failure message", async () => {
    const { runOpenSpec } = await loadModules();
    completeCommand({
      error: new Error("failed"),
    });

    await expect(runOpenSpec("/repo", ["status"])).rejects.toThrow(
      "OpenSpec command failed in /repo.",
    );
  });
});
