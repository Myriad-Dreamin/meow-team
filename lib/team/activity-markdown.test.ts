import { describe, expect, it } from "vitest";
import { formatCommitActivityReference } from "@/lib/team/activity-markdown";

describe("formatCommitActivityReference", () => {
  it("keeps review commits as plain shortened text when no GitHub URL exists", () => {
    expect(
      formatCommitActivityReference({
        commitHash: "1234567890abcdef1234567890abcdef12345678",
      }),
    ).toBe("1234567890ab");
  });

  it("emits explicit markdown links when a GitHub commit URL exists", () => {
    expect(
      formatCommitActivityReference({
        commitHash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        commitUrl: "https://github.com/example/meow-team/commit/abcdefabcdef",
      }),
    ).toBe("[abcdefabcdef](<https://github.com/example/meow-team/commit/abcdefabcdef>)");
  });
});
