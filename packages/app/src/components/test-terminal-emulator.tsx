"use dom";

import { useEffect, useMemo, useRef } from "react";
import type { DOMProps } from "expo/dom";
import "@xterm/xterm/css/xterm.css";
import type { ITheme } from "@xterm/xterm";
import { TestTerminalFrameCommand } from "@server/shared/test-terminal-protocol";
import { TerminalEmulatorRuntime } from "@/terminal/runtime/terminal-emulator-runtime";
import { openExternalUrl } from "@/utils/open-external-url";
import { focusWithRetries } from "@/utils/web-focus";

interface TestTerminalEmulatorProps {
  dom?: DOMProps;
  streamKey: string;
  webSocketUrl: string;
  testId?: string;
  xtermTheme?: ITheme;
  focusRequestToken?: number;
  resizeRequestToken?: number;
}

function toArrayBufferBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function encodeInputFrame(encoder: TextEncoder, data: string): Uint8Array {
  const frame = new Uint8Array(1 + data.length * 3);
  frame[0] = TestTerminalFrameCommand.Input;
  if (typeof encoder.encodeInto === "function") {
    const result = encoder.encodeInto(data, frame.subarray(1));
    return frame.subarray(0, 1 + result.written);
  }
  const payload = encoder.encode(data);
  const fallbackFrame = new Uint8Array(1 + payload.byteLength);
  fallbackFrame[0] = TestTerminalFrameCommand.Input;
  fallbackFrame.set(payload, 1);
  return fallbackFrame;
}

function encodeResizeFrame(
  encoder: TextEncoder,
  input: { rows: number; cols: number },
): Uint8Array {
  const payload = encoder.encode(
    JSON.stringify({
      rows: input.rows,
      cols: input.cols,
    }),
  );
  const frame = new Uint8Array(1 + payload.byteLength);
  frame[0] = TestTerminalFrameCommand.Resize;
  frame.set(payload, 1);
  return frame;
}

export default function TestTerminalEmulator({
  streamKey,
  webSocketUrl,
  testId = "test-terminal-surface",
  xtermTheme = {
    background: "#0b0b0b",
    foreground: "#e6e6e6",
    cursor: "#e6e6e6",
  },
  focusRequestToken = 0,
  resizeRequestToken = 0,
}: TestTerminalEmulatorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<TerminalEmulatorRuntime | null>(null);
  const themeKey = useMemo(
    () =>
      [
        xtermTheme.background,
        xtermTheme.foreground,
        xtermTheme.cursor,
        xtermTheme.selectionBackground,
      ]
        .map((value) => (typeof value === "string" ? value : ""))
        .join("|"),
    [xtermTheme],
  );

  useEffect(() => {
    runtimeRef.current?.setTheme({ theme: xtermTheme });
  }, [themeKey, xtermTheme]);

  useEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    if (!root || !host) {
      return;
    }

    const runtime = new TerminalEmulatorRuntime();
    const encoder = new TextEncoder();
    const ws = new WebSocket(webSocketUrl);
    let latestSize: { rows: number; cols: number } | null = null;
    ws.binaryType = "arraybuffer";

    const sendFrame = (frame: Uint8Array) => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      ws.send(frame);
    };

    runtimeRef.current = runtime;
    runtime.setCallbacks({
      callbacks: {
        onInput: (data) => {
          if (data.length > 0) {
            sendFrame(encodeInputFrame(encoder, data));
          }
        },
        onResize: (size) => {
          latestSize = size;
          sendFrame(encodeResizeFrame(encoder, size));
        },
        onOpenExternalUrl: openExternalUrl,
      },
    });
    runtime.mount({
      root,
      host,
      initialSnapshot: null,
      theme: xtermTheme,
    });

    ws.addEventListener("open", () => {
      if (latestSize) {
        sendFrame(encodeResizeFrame(encoder, latestSize));
      }
    });
    ws.addEventListener("message", (event) => {
      const frame = toArrayBufferBytes(event.data);
      if (!frame || frame.length === 0 || frame[0] !== TestTerminalFrameCommand.Output) {
        return;
      }
      runtime.writeBytes({ bytes: frame.subarray(1) });
    });

    return () => {
      ws.close();
      runtime.unmount();
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
    };
  }, [streamKey, webSocketUrl, xtermTheme]);

  useEffect(() => {
    if (focusRequestToken <= 0) {
      return;
    }
    runtimeRef.current?.resize({ force: true });
    return focusWithRetries({
      focus: () => {
        runtimeRef.current?.focus();
      },
      isFocused: () => {
        const root = rootRef.current;
        if (!root) {
          return false;
        }
        const active = typeof document !== "undefined" ? document.activeElement : null;
        return active instanceof HTMLElement && root.contains(active);
      },
    });
  }, [focusRequestToken]);

  useEffect(() => {
    if (resizeRequestToken <= 0) {
      return;
    }
    runtimeRef.current?.resize({ force: true });
  }, [resizeRequestToken]);

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        backgroundColor: xtermTheme.background ?? "#0b0b0b",
        overflow: "hidden",
        overscrollBehavior: "none",
        touchAction: "pan-y",
      }}
      onPointerDown={() => {
        runtimeRef.current?.focus();
      }}
    >
      <div
        ref={hostRef}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          overscrollBehavior: "none",
          padding: 0,
        }}
      />
    </div>
  );
}
