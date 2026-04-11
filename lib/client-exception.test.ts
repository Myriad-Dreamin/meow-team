import { describe, expect, it } from "vitest";
import {
  formatBoundaryException,
  formatUnhandledRejectionException,
  formatWindowErrorException,
} from "@/lib/client-exception";

describe("formatBoundaryException", () => {
  it("preserves the readable message and digest from a boundary error", () => {
    const error = new Error("Widget exploded") as Error & {
      digest?: string;
    };
    error.name = "TypeError";
    error.digest = "digest-123";

    expect(formatBoundaryException(error, "route")).toMatchObject({
      badge: "Client exception",
      title: "Widget exploded",
      summary: "Captured by the route error boundary.",
      name: "TypeError",
      digest: "digest-123",
    });
  });
});

describe("formatWindowErrorException", () => {
  it("falls back to the browser event message and source location", () => {
    expect(
      formatWindowErrorException({
        error: null,
        message: "Script failed to initialize",
        filename: "/_next/static/chunks/main.js",
        lineno: 9,
        colno: 27,
      }),
    ).toMatchObject({
      badge: "Client exception",
      title: "Script failed to initialize",
      location: "/_next/static/chunks/main.js:9:27",
    });
  });
});

describe("formatUnhandledRejectionException", () => {
  it("shows a readable fallback and serialized debug value for non-Error rejections", () => {
    expect(
      formatUnhandledRejectionException({
        reason: {
          detail: "Missing session token",
          status: 401,
        },
      }),
    ).toMatchObject({
      badge: "Unhandled rejection",
      title: "A promise rejected without an error message.",
      summary: "Captured from an unhandled promise rejection.",
      debugValue: '{\n  "detail": "Missing session token",\n  "status": 401\n}',
    });
  });
});
