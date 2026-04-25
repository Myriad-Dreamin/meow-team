export const TEST_TERMINAL_WEBSOCKET_PATH = "/api/test/terminal";

export const TestTerminalFrameCommand = {
  Input: 0,
  Output: 1,
  Resize: 2,
} as const;

export type TestTerminalFrameCommand =
  (typeof TestTerminalFrameCommand)[keyof typeof TestTerminalFrameCommand];
