import { describe, expect, it } from "vitest";
import { resolveWorkspaceFileCopyPath } from "@/utils/workspace-file-copy-path";

describe("resolveWorkspaceFileCopyPath", () => {
  it("passes absolute paths through unchanged", () => {
    expect(
      resolveWorkspaceFileCopyPath({
        workspaceDirectory: "/repo",
        directory: "/repo/src",
        path: "/tmp/file.ts",
      }),
    ).toBe("/tmp/file.ts");
  });

  it("joins relative paths with an absolute directory", () => {
    expect(
      resolveWorkspaceFileCopyPath({
        directory: "/repo/src",
        path: "index.ts",
      }),
    ).toBe("/repo/src/index.ts");
  });

  it("joins workspace-relative paths with the workspace directory", () => {
    expect(
      resolveWorkspaceFileCopyPath({
        workspaceDirectory: "/repo",
        directory: "src",
        path: "src/index.ts",
      }),
    ).toBe("/repo/src/index.ts");
  });

  it("uses a relative directory under the workspace when the path is a basename", () => {
    expect(
      resolveWorkspaceFileCopyPath({
        workspaceDirectory: "/repo",
        directory: "src/components",
        path: "button.tsx",
      }),
    ).toBe("/repo/src/components/button.tsx");
  });
});
