import { describe, expect, it } from "vitest";
import { compilePromptModule } from "./src/compiler";

describe("meow-prompt compiler grammar", () => {
  it("rejects spaced placeholder syntax", () => {
    expect(() =>
      compilePromptModule("[[param:name | raw]]", {
        resourcePath: "/virtual/invalid.prompt.md",
        runtimeModulePath: "/virtual/runtime.ts",
      }),
    ).toThrow();

    expect(() =>
      compilePromptModule("[[param:name| raw]]", {
        resourcePath: "/virtual/invalid.prompt.md",
        runtimeModulePath: "/virtual/runtime.ts",
      }),
    ).toThrow();
  });
});
