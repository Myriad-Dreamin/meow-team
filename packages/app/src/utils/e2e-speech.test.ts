import { describe, expect, it } from "vitest";

import { parseOptionalBooleanEnv, resolvePlaywrightSpeechEnabled } from "./e2e-speech";

describe("resolvePlaywrightSpeechEnabled", () => {
  it("defaults speech to disabled for app e2e runs", () => {
    expect(resolvePlaywrightSpeechEnabled({})).toBe(false);
  });

  it("enables speech when E2E_ENABLE_SPEECH is truthy", () => {
    expect(resolvePlaywrightSpeechEnabled({ E2E_ENABLE_SPEECH: "1" })).toBe(true);
    expect(resolvePlaywrightSpeechEnabled({ E2E_ENABLE_SPEECH: "true" })).toBe(true);
    expect(resolvePlaywrightSpeechEnabled({ E2E_ENABLE_SPEECH: "yes" })).toBe(true);
  });

  it("keeps speech disabled when E2E_ENABLE_SPEECH is falsey or invalid", () => {
    expect(resolvePlaywrightSpeechEnabled({ E2E_ENABLE_SPEECH: "0" })).toBe(false);
    expect(resolvePlaywrightSpeechEnabled({ E2E_ENABLE_SPEECH: "off" })).toBe(false);
    expect(resolvePlaywrightSpeechEnabled({ E2E_ENABLE_SPEECH: "unexpected" })).toBe(false);
  });
});

describe("parseOptionalBooleanEnv", () => {
  it("returns undefined for unknown values", () => {
    expect(parseOptionalBooleanEnv(undefined)).toBeUndefined();
    expect(parseOptionalBooleanEnv("maybe")).toBeUndefined();
  });
});
