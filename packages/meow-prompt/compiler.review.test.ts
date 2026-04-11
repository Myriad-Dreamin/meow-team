import { describe, expect, it } from "vitest";
import { compilePromptModule } from "./src/compiler";

const compileReviewPrompt = (source: string) => {
  return compilePromptModule(source, {
    resourcePath: "/virtual/invalid.prompt.md",
    runtimeModulePath: "/virtual/runtime.ts",
  });
};

describe("meow-prompt compiler grammar", () => {
  it("rejects spaced placeholder syntax", () => {
    expect(() => compileReviewPrompt("[[param:name | raw]]")).toThrow();

    expect(() => compileReviewPrompt("[[param:name| raw]]")).toThrow();
  });

  it("rejects unknown builtin pipe names", () => {
    expect(() => compileReviewPrompt("[[param:name|unknown]]")).toThrow(
      'Unknown prompt pipe "unknown".',
    );
  });

  it("rejects unsupported raw pipe signatures", () => {
    expect(() => compileReviewPrompt("[[param:name|raw('yaml')]]")).toThrow(
      'Unsupported raw pipe signature: raw("yaml")',
    );
  });
});
