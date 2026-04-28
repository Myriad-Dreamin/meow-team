import { describe, expect, it } from "vitest";
import {
  estimateStreamingTokenCount,
  getStreamingRevealIndex,
  getStreamingTokenRate,
} from "./use-smooth-streaming-text";

describe("smooth streaming text helpers", () => {
  it("uses a minimum 30 token per second reveal rate for short backlogs", () => {
    expect(getStreamingTokenRate(1)).toBe(30);
    expect(getStreamingTokenRate(29)).toBe(30);
  });

  it("uses the remaining token count as the reveal rate for larger backlogs", () => {
    expect(getStreamingTokenRate(30)).toBe(30);
    expect(getStreamingTokenRate(120)).toBe(120);
  });

  it("estimates CJK characters as denser tokens than ASCII prose", () => {
    expect(estimateStreamingTokenCount("流式聊天")).toBe(4);
    expect(estimateStreamingTokenCount("streaming chat")).toBe(4);
  });

  it("reveals by approximate token budget without splitting surrogate pairs", () => {
    const text = "hello 🙂 world";
    const firstReveal = getStreamingRevealIndex(text, 0, 1.75);

    expect(text.slice(0, firstReveal)).toBe("hello 🙂 ");
    expect(firstReveal).toBeGreaterThan(0);
    expect(firstReveal).toBeLessThan(text.length);
  });
});
