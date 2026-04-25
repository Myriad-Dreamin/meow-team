import { Buffer } from "node:buffer";
import type { IncomingMessage } from "node:http";
import { homedir } from "node:os";
import * as pty from "node-pty";
import type { Logger } from "pino";
import type { RawData, WebSocket } from "ws";
import {
  TEST_TERMINAL_WEBSOCKET_PATH,
  TestTerminalFrameCommand,
} from "../shared/test-terminal-protocol.js";
import {
  buildTerminalEnvironment,
  ensureNodePtySpawnHelperExecutableForCurrentPlatform,
  resolveDefaultTerminalShell,
} from "../terminal/terminal.js";

const DEFAULT_TEST_TERMINAL_COLS = 80;
const DEFAULT_TEST_TERMINAL_ROWS = 24;
const WEBSOCKET_OPEN = 1;
const WEBSOCKET_CLOSING = 2;
const WEBSOCKET_CLOSED = 3;
const SHUTDOWN_CLOSE_TIMEOUT_MS = 250;

type Disposable = {
  dispose(): void;
};

export interface TestTerminalPty {
  onData(listener: (data: string) => void): Disposable;
  onExit(listener: () => void): Disposable;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface SpawnTestTerminalPtyInput {
  cwd: string;
  shell: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
}

export type SpawnTestTerminalPty = (input: SpawnTestTerminalPtyInput) => TestTerminalPty;

export function getTestTerminalCwd(): string {
  return process.env.HOME || homedir();
}

export function spawnNodePtyTestTerminal(input: SpawnTestTerminalPtyInput): TestTerminalPty {
  ensureNodePtySpawnHelperExecutableForCurrentPlatform();
  return pty.spawn(input.shell, [], {
    name: "xterm-256color",
    cols: input.cols,
    rows: input.rows,
    cwd: input.cwd,
    env: buildTerminalEnvironment({ shell: input.shell, env: input.env }),
  });
}

export function getWebSocketRequestPath(url: string | undefined): string {
  const rawPath = url?.trim() || "/";
  const queryIndex = rawPath.indexOf("?");
  return queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex);
}

export function isTestTerminalWebSocketPath(url: string | undefined): boolean {
  return getWebSocketRequestPath(url) === TEST_TERMINAL_WEBSOCKET_PATH;
}

export function isDaemonWebSocketPath(url: string | undefined): boolean {
  const path = getWebSocketRequestPath(url);
  return path === "/ws" || path === TEST_TERMINAL_WEBSOCKET_PATH;
}

function rawDataToBytes(data: RawData): Uint8Array | null {
  if (typeof data === "string") {
    return null;
  }
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data)) {
    const buffer = Buffer.concat(data);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return null;
}

function sendOutputFrame(ws: WebSocket, data: string): void {
  if (ws.readyState !== WEBSOCKET_OPEN || data.length === 0) {
    return;
  }
  const outputBytes = Buffer.from(data, "utf8");
  const frame = Buffer.allocUnsafe(1 + outputBytes.byteLength);
  frame[0] = TestTerminalFrameCommand.Output;
  outputBytes.copy(frame, 1);
  ws.send(frame, { binary: true });
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function parseResizePayload(payload: Uint8Array): { rows: number; cols: number } | null {
  try {
    const parsed = JSON.parse(Buffer.from(payload).toString("utf8")) as {
      rows?: unknown;
      cols?: unknown;
      columns?: unknown;
    };
    const rows = parsePositiveInt(parsed.rows);
    const cols = parsePositiveInt(parsed.cols ?? parsed.columns);
    if (!rows || !cols) {
      return null;
    }
    return { rows, cols };
  } catch {
    return null;
  }
}

class ActiveTestTerminalSession {
  private disposed = false;

  constructor(
    private readonly input: {
      ws: WebSocket;
      ptyProcess: TestTerminalPty;
      dataSubscription: Disposable;
      exitSubscription: Disposable;
      logger: Logger;
      onDispose: () => void;
    },
  ) {}

  dispose(reason: "socket" | "pty-exit" | "shutdown"): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.input.onDispose();

    try {
      this.input.dataSubscription.dispose();
    } catch {
      // no-op
    }
    try {
      this.input.exitSubscription.dispose();
    } catch {
      // no-op
    }
    try {
      this.input.ptyProcess.kill();
    } catch (err) {
      this.input.logger.debug({ err, reason }, "Failed to kill test terminal PTY");
    }
  }

  async closeForShutdown(): Promise<void> {
    const { ws } = this.input;
    this.dispose("shutdown");
    if (ws.readyState === WEBSOCKET_CLOSED) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, SHUTDOWN_CLOSE_TIMEOUT_MS);
      const finish = () => {
        clearTimeout(timeout);
        resolve();
      };
      ws.once("close", finish);
      if (ws.readyState === WEBSOCKET_OPEN || ws.readyState === WEBSOCKET_CLOSING) {
        ws.close(1001, "Daemon shutdown");
      } else {
        finish();
      }
    });
  }
}

export class TestTerminalWebSocketBridge {
  private readonly logger: Logger;
  private readonly spawnPty: SpawnTestTerminalPty;
  private readonly sessions = new Set<ActiveTestTerminalSession>();

  constructor(input: { logger: Logger; spawnPty?: SpawnTestTerminalPty }) {
    this.logger = input.logger.child({ module: "test-terminal-websocket" });
    this.spawnPty = input.spawnPty ?? spawnNodePtyTestTerminal;
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  handleConnection(ws: WebSocket, request?: IncomingMessage): void {
    const shell = resolveDefaultTerminalShell();
    let ptyProcess: TestTerminalPty;
    try {
      ptyProcess = this.spawnPty({
        cwd: getTestTerminalCwd(),
        shell,
        env: {},
        cols: DEFAULT_TEST_TERMINAL_COLS,
        rows: DEFAULT_TEST_TERMINAL_ROWS,
      });
    } catch (err) {
      this.logger.error(
        { err, path: getWebSocketRequestPath(request?.url) },
        "Failed to spawn test terminal PTY",
      );
      ws.close(1011, "Failed to spawn test terminal");
      return;
    }

    let session: ActiveTestTerminalSession | null = null;
    const dataSubscription = ptyProcess.onData((data) => {
      sendOutputFrame(ws, data);
    });
    const exitSubscription = ptyProcess.onExit(() => {
      if (!session) {
        return;
      }
      session.dispose("pty-exit");
      if (ws.readyState === WEBSOCKET_OPEN) {
        ws.close(1000, "PTY exited");
      }
    });

    session = new ActiveTestTerminalSession({
      ws,
      ptyProcess,
      dataSubscription,
      exitSubscription,
      logger: this.logger,
      onDispose: () => {
        if (session) {
          this.sessions.delete(session);
        }
      },
    });
    this.sessions.add(session);

    ws.on("message", (data: RawData) => {
      const bytes = rawDataToBytes(data);
      if (!bytes || bytes.length === 0) {
        return;
      }

      const command = bytes[0];
      const payload = bytes.subarray(1);
      if (command === TestTerminalFrameCommand.Input) {
        if (payload.length > 0) {
          ptyProcess.write(Buffer.from(payload).toString("utf8"));
        }
        return;
      }

      if (command === TestTerminalFrameCommand.Resize) {
        const size = parseResizePayload(payload);
        if (size) {
          ptyProcess.resize(size.cols, size.rows);
        }
      }
    });

    ws.on("close", () => {
      session.dispose("socket");
    });
    ws.on("error", (err) => {
      this.logger.debug({ err }, "Test terminal WebSocket error");
      session.dispose("socket");
    });
  }

  async close(): Promise<void> {
    const sessions = Array.from(this.sessions);
    await Promise.all(sessions.map((session) => session.closeForShutdown()));
    this.sessions.clear();
  }
}
