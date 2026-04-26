import { afterEach, describe, expect, test } from "vitest";
import { resolvePaseoCommandInvocation } from "./paseo-command.js";

const originalPaseoBin = process.env.MFL_PASEO_BIN;

afterEach(() => {
  if (originalPaseoBin === undefined) {
    delete process.env.MFL_PASEO_BIN;
    return;
  }

  process.env.MFL_PASEO_BIN = originalPaseoBin;
});

describe("resolvePaseoCommandInvocation", () => {
  test("uses paseo from PATH by default", () => {
    delete process.env.MFL_PASEO_BIN;

    expect(resolvePaseoCommandInvocation()).toEqual({
      command: "paseo",
      argsPrefix: [],
    });
  });

  test("uses MFL_PASEO_BIN when set", () => {
    process.env.MFL_PASEO_BIN = "/opt/paseo/bin/paseo";

    expect(resolvePaseoCommandInvocation()).toEqual({
      command: "/opt/paseo/bin/paseo",
      argsPrefix: [],
    });
  });

  test("ignores a blank MFL_PASEO_BIN", () => {
    process.env.MFL_PASEO_BIN = "   ";

    expect(resolvePaseoCommandInvocation()).toEqual({
      command: "paseo",
      argsPrefix: [],
    });
  });
});
