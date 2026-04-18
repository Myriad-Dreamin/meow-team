import { describe, expect, it } from "vitest";
import {
  applyThreadCommandAutocomplete,
  getActiveThreadCommandToken,
  getThreadCommandAutocompleteMatches,
} from "@/lib/team/thread-command-autocomplete";
import {
  SUPPORTED_THREAD_COMMANDS,
  THREAD_COMMAND_HELP_TEXT,
  THREAD_COMMAND_PLACEHOLDER,
} from "@/lib/team/thread-command";

describe("thread command metadata", () => {
  it("keeps helper text and placeholder guidance aligned with supported commands", () => {
    expect(SUPPORTED_THREAD_COMMANDS.map((command) => command.command)).toEqual([
      "/approve",
      "/ready",
      "/replan",
      "/replan-all",
    ]);
    expect(SUPPORTED_THREAD_COMMANDS.map((command) => command.syntax)).toEqual([
      "/approve [proposal-number]",
      "/ready [proposal-number]",
      "/replan [proposal-number] requirement",
      "/replan-all requirement",
    ]);
    expect(THREAD_COMMAND_HELP_TEXT).toBe(
      "Supported commands: /approve [proposal-number], /ready [proposal-number], /replan [proposal-number] requirement, /replan-all requirement.",
    );
    expect(THREAD_COMMAND_PLACEHOLDER).toBe("/approve, /ready, /replan, /replan-all");
  });
});

describe("thread command autocomplete helpers", () => {
  it("detects the active leading slash-command token while the caret stays within it", () => {
    expect(getActiveThreadCommandToken({ value: "  /rep", selectionStart: 6 })).toEqual({
      from: 2,
      text: "/rep",
      to: 6,
    });
    expect(
      getActiveThreadCommandToken({
        value: "/replan 3 tighten the scope",
        selectionStart: 8,
      }),
    ).toBeNull();
    expect(
      getActiveThreadCommandToken({
        value: "note /rep",
        selectionStart: 9,
      }),
    ).toBeNull();
    expect(
      getActiveThreadCommandToken({
        value: "/rep",
        selectionEnd: 4,
        selectionStart: 0,
      }),
    ).toBeNull();
  });

  it("matches supported commands by prefix in metadata order", () => {
    const matches = getThreadCommandAutocompleteMatches({
      value: "/r",
      selectionStart: 2,
    });

    expect(matches?.items.map((command) => command.command)).toEqual([
      "/ready",
      "/replan",
      "/replan-all",
    ]);
    expect(matches?.items.map((command) => command.syntax)).toEqual([
      "/ready [proposal-number]",
      "/replan [proposal-number] requirement",
      "/replan-all requirement",
    ]);
  });

  it("replaces only the command token and leaves the caret ready for the next argument", () => {
    const replan = SUPPORTED_THREAD_COMMANDS.find((command) => command.kind === "replan");
    expect(replan).toBeDefined();

    const insertedIntoEmptyDraft = applyThreadCommandAutocomplete({
      command: replan!,
      selectionStart: 4,
      value: "/rep",
    });
    expect(insertedIntoEmptyDraft).toEqual({
      selectionEnd: 8,
      selectionStart: 8,
      value: "/replan ",
    });
    expect(insertedIntoEmptyDraft?.value).not.toContain("[proposal-number]");
    expect(insertedIntoEmptyDraft?.value).not.toContain("requirement");

    expect(
      applyThreadCommandAutocomplete({
        command: replan!,
        selectionStart: 4,
        value: "/rep 3 tighten the scope",
      }),
    ).toEqual({
      selectionEnd: 8,
      selectionStart: 8,
      value: "/replan 3 tighten the scope",
    });
  });
});
