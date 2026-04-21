import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeTemporaryAuthFile, writeTemporaryEnvFile } from "@/lib/agent/codex-cli";

describe("writeTemporaryAuthFile", () => {
  const tempPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0).map(async (targetPath) => {
        await rm(targetPath, {
          force: true,
          recursive: true,
        });
      }),
    );
  });

  it("copies the existing Codex auth file directly when it is available", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "codex-auth-copy-"));
    tempPaths.push(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");
    const sourceAuthPath = path.join(tempRoot, "source-auth.json");
    const sourceAuth = JSON.stringify(
      {
        auth_mode: "oauth",
        refresh_token: "refresh-token",
      },
      null,
      2,
    );

    await writeFile(sourceAuthPath, sourceAuth, "utf8");
    await writeTemporaryAuthFile({
      codexHome,
      sourceAuthPath,
    });

    await expect(readFile(path.join(codexHome, "auth.json"), "utf8")).resolves.toBe(sourceAuth);
  });

  it("fails when the source auth file is missing", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "codex-auth-missing-"));
    tempPaths.push(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");

    await expect(
      writeTemporaryAuthFile({
        codexHome,
        sourceAuthPath: path.join(tempRoot, "missing-auth.json"),
      }),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("creates the temp Codex home before copying the auth file", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "codex-auth-dir-"));
    tempPaths.push(tempRoot);
    const codexHome = path.join(tempRoot, "nested", "codex-home");
    const sourceAuthPath = path.join(tempRoot, "source-auth.json");
    const sourceAuth = JSON.stringify(
      {
        auth_mode: "oauth",
        refresh_token: "refresh-token",
      },
      null,
      2,
    );

    await writeFile(sourceAuthPath, sourceAuth, "utf8");
    await writeTemporaryAuthFile({
      codexHome,
      sourceAuthPath,
    });

    await expect(access(codexHome)).resolves.toBeUndefined();
    await expect(readFile(path.join(codexHome, "auth.json"), "utf8")).resolves.toBe(sourceAuth);
  });
});

describe("writeTemporaryEnvFile", () => {
  const tempPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0).map(async (targetPath) => {
        await rm(targetPath, {
          force: true,
          recursive: true,
        });
      }),
    );
  });

  it("copies the existing Codex env file when it is available", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "codex-env-copy-"));
    tempPaths.push(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");
    const sourceEnvPath = path.join(tempRoot, "source.env");
    const sourceEnv = "OPENAI_API_KEY=test-key\n";

    await writeFile(sourceEnvPath, sourceEnv, "utf8");
    await writeTemporaryEnvFile({
      codexHome,
      sourceEnvPath,
    });

    await expect(readFile(path.join(codexHome, ".env"), "utf8")).resolves.toBe(sourceEnv);
  });

  it("skips copying when the source env file is missing", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "codex-env-missing-"));
    tempPaths.push(tempRoot);
    const codexHome = path.join(tempRoot, "codex-home");

    await expect(
      writeTemporaryEnvFile({
        codexHome,
        sourceEnvPath: path.join(tempRoot, "missing.env"),
      }),
    ).resolves.toBeUndefined();
    await expect(access(path.join(codexHome, ".env"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
