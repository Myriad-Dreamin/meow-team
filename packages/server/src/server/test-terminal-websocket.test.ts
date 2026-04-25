import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import type { WebSocket } from "ws";
import { TestTerminalFrameCommand } from "../shared/test-terminal-protocol.js";
import { resolveDefaultTerminalShell } from "../terminal/terminal.js";
import {
  getTestTerminalCwd,
  isDaemonWebSocketPath,
  TestTerminalWebSocketBridge,
  type SpawnTestTerminalPtyInput,
  type TestTerminalPty,
} from "./test-terminal-websocket.js";

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  sent: unknown[] = [];

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string): void {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.emit("close");
  }
}

class FakePty implements TestTerminalPty {
  readonly dataListeners = new Set<(data: string) => void>();
  readonly exitListeners = new Set<() => void>();
  readonly write = vi.fn();
  readonly resize = vi.fn();
  readonly kill = vi.fn();

  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener);
    return {
      dispose: () => {
        this.dataListeners.delete(listener);
      },
    };
  }

  onExit(listener: () => void) {
    this.exitListeners.add(listener);
    return {
      dispose: () => {
        this.exitListeners.delete(listener);
      },
    };
  }

  emitData(data: string): void {
    for (const listener of Array.from(this.dataListeners)) {
      listener(data);
    }
  }

  emitExit(): void {
    for (const listener of Array.from(this.exitListeners)) {
      listener();
    }
  }
}

function createLogger(): Logger {
  const logger = {
    child: vi.fn(() => logger),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger as unknown as Logger;
}

function createFrame(command: number, payload: string): Buffer {
  const payloadBytes = Buffer.from(payload, "utf8");
  const frame = Buffer.allocUnsafe(1 + payloadBytes.byteLength);
  frame[0] = command;
  payloadBytes.copy(frame, 1);
  return frame;
}

function sentBytes(ws: FakeWebSocket): Buffer {
  const sent = ws.sent.at(-1);
  if (!sent) {
    throw new Error("Expected a sent WebSocket frame");
  }
  return Buffer.from(sent as Uint8Array);
}

function createBridgeWithFakePty(fakePty: FakePty, spawnInputs: SpawnTestTerminalPtyInput[] = []) {
  const bridge = new TestTerminalWebSocketBridge({
    logger: createLogger(),
    spawnPty: (input) => {
      spawnInputs.push(input);
      return fakePty;
    },
  });
  const ws = new FakeWebSocket();
  bridge.handleConnection(ws as unknown as WebSocket, { url: "/api/test/terminal" } as any);
  return { bridge, ws };
}

describe("test terminal WebSocket bridge", () => {
  it("recognizes the daemon test terminal WebSocket route", () => {
    expect(isDaemonWebSocketPath("/api/test/terminal")).toBe(true);
    expect(isDaemonWebSocketPath("/api/test/terminal?debug=1")).toBe(true);
    expect(isDaemonWebSocketPath("/ws")).toBe(true);
    expect(isDaemonWebSocketPath("/api/other")).toBe(false);
  });

  it("spawns one HOME PTY with the default shell per connection", () => {
    const fakePty = new FakePty();
    const spawnInputs: SpawnTestTerminalPtyInput[] = [];

    createBridgeWithFakePty(fakePty, spawnInputs);

    expect(spawnInputs).toHaveLength(1);
    expect(spawnInputs[0]).toMatchObject({
      cwd: getTestTerminalCwd(),
      shell: resolveDefaultTerminalShell(),
      cols: 80,
      rows: 24,
    });
  });

  it("forwards PTY output as an output command byte followed by output bytes", () => {
    const fakePty = new FakePty();
    const { ws } = createBridgeWithFakePty(fakePty);

    fakePty.emitData("hello\r\n");

    const frame = sentBytes(ws);
    expect(frame[0]).toBe(TestTerminalFrameCommand.Output);
    expect(frame.subarray(1).toString("utf8")).toBe("hello\r\n");
  });

  it("forwards input frames to the PTY in byte order", () => {
    const fakePty = new FakePty();
    const { ws } = createBridgeWithFakePty(fakePty);

    ws.emit("message", createFrame(TestTerminalFrameCommand.Input, "printf test\n"));

    expect(fakePty.write).toHaveBeenCalledWith("printf test\n");
  });

  it("handles resize control frames by resizing the PTY", () => {
    const fakePty = new FakePty();
    const { ws } = createBridgeWithFakePty(fakePty);

    ws.emit(
      "message",
      createFrame(TestTerminalFrameCommand.Resize, JSON.stringify({ rows: 31, cols: 127 })),
    );

    expect(fakePty.resize).toHaveBeenCalledWith(127, 31);
  });

  it("kills the PTY and disposes listeners on WebSocket disconnect", () => {
    const fakePty = new FakePty();
    const { bridge, ws } = createBridgeWithFakePty(fakePty);

    ws.emit("close");

    expect(fakePty.kill).toHaveBeenCalledTimes(1);
    expect(fakePty.dataListeners.size).toBe(0);
    expect(fakePty.exitListeners.size).toBe(0);
    expect(bridge.getActiveSessionCount()).toBe(0);
  });

  it("closes active sockets and kills PTYs on daemon shutdown cleanup", async () => {
    const fakePty = new FakePty();
    const { bridge, ws } = createBridgeWithFakePty(fakePty);

    await bridge.close();

    expect(ws.readyState).toBe(3);
    expect(fakePty.kill).toHaveBeenCalledTimes(1);
    expect(bridge.getActiveSessionCount()).toBe(0);
  });
});
