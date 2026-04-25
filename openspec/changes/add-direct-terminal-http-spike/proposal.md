## Why

The current in-app terminal path includes the daemon terminal session, server-side headless xterm state, the shared daemon WebSocket, React Native state, an Expo DOM bridge, and the DOM xterm renderer. Paseo's terminal stream wire format is already binary, but the hot path still converts PTY output through string/headless-terminal/client-controller layers before xterm renders it.

External `ttyd` testing shows that a short `PTY -> WebSocket binary frame -> xterm.write(Uint8Array)` path can be extremely smooth. This spike adds an additive test terminal path inside the existing daemon/app so we can compare Paseo's production terminal against a ttyd-shaped path without modifying the existing terminal implementation.

## What Changes

- Add an additive daemon WebSocket upgrade route at `/api/test/terminal`.
- Each `/api/test/terminal` connection owns one default shell PTY started in the daemon process user's `HOME`.
- Do not route the test terminal through `TerminalManager`, the existing terminal stream subscription protocol, snapshots, or the production terminal session state.
- Add a `Test terminal` button to the right of the `New terminal` tab action. The button opens an ephemeral test terminal surface connected directly to `/api/test/terminal`.
- Transfer and render data in the same shape as ttyd: one-byte binary command frames, raw PTY output bytes, browser input encoded to bytes, resize as a small control frame, and xterm rendering via `write(Uint8Array)` without output `TextDecoder` in the hot path.
- Keep the existing production terminal protocol, terminal manager, terminal tab behavior, CLI terminal commands, relay behavior, and message schemas unchanged.
- Add focused tests or smoke coverage for the daemon test endpoint, PTY forwarding, browser-side direct rendering, input, resize, and cleanup.

## Capabilities

### New Capabilities

- `direct-terminal-http-spike`: Provide a debug-only app-accessible test terminal path that connects directly to a daemon-owned PTY over `/api/test/terminal` and renders PTY bytes through a ttyd-style browser xterm path.

### Modified Capabilities

None.

## Impact

- `packages/server` daemon HTTP upgrade routing and a new `/api/test/terminal` PTY bridge
- `packages/app` terminal tab controls and a new ephemeral test terminal surface/runtime
- Reuse of existing shell/env helper logic where practical, while bypassing `TerminalManager` and production terminal snapshots
- Focused tests for daemon WebSocket byte forwarding and app direct-render behavior
- No breaking changes to existing WebSocket session schemas, production terminal message schemas, mobile app terminal tabs, CLI terminal commands, or relay behavior
