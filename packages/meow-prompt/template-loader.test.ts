import { describe, expect, it } from "vitest";
import { prompt as noParameterPrompt } from "./fixtures/no-parameter.prompt.md";
import { prompt as rawJsonPrompt } from "./fixtures/raw-json.template.md";
import { prompt as rawParameterPrompt } from "./fixtures/raw-parameter.prompt.md";
import { prompt as simpleParameterPrompt } from "./fixtures/simple-parameter.prompt.md";

describe("meow-prompt direct imports", () => {
  it("renders a template without parameters", () => {
    expect(noParameterPrompt()).toBe("This prompt has no parameters.\n");
  });

  it("renders a simple parameter substitution", () => {
    expect(simpleParameterPrompt({ name: "team" })).toBe("Hello team.\n");
  });

  it("renders a raw parameter substitution", () => {
    expect(rawParameterPrompt({ snippet: "const ready = true;" })).toBe("const ready = true;\n");
  });

  it("renders a raw pipe with an argument", () => {
    expect(rawJsonPrompt({ payload: { ready: true, workers: 2 } })).toBe(
      '\n{\n  "ready": true,\n  "workers": 2\n}\n',
    );
  });
});
