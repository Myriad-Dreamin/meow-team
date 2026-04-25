import { TEST_TERMINAL_WEBSOCKET_PATH } from "@server/shared/test-terminal-protocol";

export function buildTestTerminalWebSocketUrl(baseWebSocketUrl: string): string | null {
  try {
    const url = new URL(baseWebSocketUrl);
    url.pathname = TEST_TERMINAL_WEBSOCKET_PATH;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
