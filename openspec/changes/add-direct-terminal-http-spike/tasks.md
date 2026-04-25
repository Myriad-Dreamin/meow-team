## 1. Daemon test WebSocket endpoint

- [x] 1.1 Add an additive daemon HTTP upgrade route for `GET /api/test/terminal`.
- [x] 1.2 Ensure the route is separate from the production daemon session WebSocket protocol and does not add or change existing session message schemas.
- [x] 1.3 Keep the route on the existing daemon HTTP surface without adding a separate startup flag or separate debug port.
- [x] 1.4 Track active test terminal sockets so daemon shutdown can close them cleanly.

## 2. Direct PTY bridge

- [x] 2.1 Spawn one direct `node-pty` PTY per `/api/test/terminal` WebSocket connection.
- [x] 2.2 Start the PTY in the daemon process user's `HOME` using the default shell.
- [x] 2.3 Reuse shell and environment resolution helpers where practical without using `TerminalManager.createTerminal`.
- [x] 2.4 Forward PTY output as ttyd-style binary frames: one command byte followed by raw PTY output bytes.
- [x] 2.5 Forward browser input frames to the PTY in byte order.
- [x] 2.6 Handle resize control frames by resizing the PTY.
- [x] 2.7 Dispose PTY and listener resources on WebSocket disconnect and daemon shutdown.

## 3. Test terminal app surface

- [x] 3.1 Add a `Test terminal` button to the right of the existing `New terminal` tab action.
- [x] 3.2 Open an ephemeral, non-persisted test terminal surface when the button is pressed.
- [x] 3.3 Connect the test surface directly to the active daemon's `/api/test/terminal` WebSocket endpoint.
- [x] 3.4 Keep the production terminal tab/session behavior unchanged.

## 4. ttyd-style browser transmission/rendering

- [x] 4.1 Set the test terminal WebSocket `binaryType` to `arraybuffer`.
- [x] 4.2 Decode only the one-byte command prefix for output frames and pass the remaining `Uint8Array` payload directly to `xterm.write()`.
- [x] 4.3 Avoid output `TextDecoder` and React Native output callbacks in the test terminal hot path.
- [x] 4.4 Encode xterm input strings to bytes for input frames, using `TextEncoder.encodeInto()` where practical.
- [x] 4.5 Send resize as a low-frequency control frame and keep resize handling out of the output hot path.

## 5. Verification

- [x] 5.1 Add targeted server tests for `/api/test/terminal` upgrade, PTY output forwarding, input forwarding, resize handling, disconnect cleanup, and daemon shutdown cleanup.
- [x] 5.2 Add focused app/runtime tests or a smoke check proving output bytes are written to xterm without output `TextDecoder`.
- [ ] 5.3 Add a manual check that opens `Test terminal`, runs a simple shell command, and compares smoothness against normal terminal and ttyd.
- [x] 5.4 Run the focused test files and the workspace typecheck after implementation.
