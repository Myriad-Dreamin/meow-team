## Context

The current Paseo terminal is optimized for the product surface, not for isolating performance variables. PTY output is processed by the daemon terminal session, parsed by server-side headless xterm for snapshots, sent over the shared daemon WebSocket, decoded by the app runtime, passed through React Native state and an Expo DOM boundary, then rendered by the browser xterm instance.

The existing terminal stream protocol already uses binary frames for active terminal output/input, so the remaining question is not "binary vs JSON." The remaining question is how much latency comes from the production terminal layers around the binary wire format.

External ttyd testing shows that a short path shaped like `PTY bytes -> one-byte WebSocket command frame -> xterm.write(Uint8Array)` is extremely smooth. This change introduces a debug-only test terminal path inside the existing daemon and app. It is intentionally not a product terminal replacement. Its job is to create a controlled baseline for later optimization work while leaving the existing terminal path unchanged.

## Goals / Non-Goals

**Goals:**

- Add a daemon WebSocket upgrade endpoint at `/api/test/terminal` on the existing daemon HTTP server.
- Start one default shell PTY per test-terminal WebSocket connection.
- Start that shell in the daemon process user's `HOME`.
- Forward PTY output to the browser as raw bytes in ttyd-style one-byte command frames.
- Forward browser input to the PTY as raw bytes in ttyd-style one-byte command frames.
- Support resize control messages sufficient for normal shell usage.
- Add a `Test terminal` button next to the existing `New terminal` tab action.
- Render test-terminal output through a direct browser xterm runtime using `xterm.write(Uint8Array)` without output `TextDecoder` in the hot path.
- Keep the existing production terminal protocol, session state, snapshots, and tab behavior unchanged.

**Non-Goals:**

- Replacing the production terminal pane in the mobile or desktop app
- Adding a separate debug HTTP server or separate debug port
- Serving a standalone debug terminal HTML page
- Adding long-term terminal management UI for the test terminal
- Persisting test terminal sessions across tab switches, app reloads, or reconnects
- Supporting attach/replay/snapshot for test terminals
- Changing existing session WebSocket or terminal message schemas
- Refactoring the existing `TerminalManager`, `TerminalPane`, or production terminal stream controller as part of the spike

## Decisions

### 1. Use the existing daemon HTTP server with a test WebSocket route

Do not start a separate HTTP server, allocate a separate port, or serve a standalone terminal page. Add a test-only WebSocket upgrade path on the daemon's existing HTTP server:

```text
/api/test/terminal
```

The route should be separate from the production `VoiceAssistantWebSocketServer` session protocol. The daemon HTTP server may dispatch this path before the normal session WebSocket handler, but the test terminal must not become a new production session message type.

This keeps connection setup simple for the app while still bypassing normal terminal subscriptions, message schemas, terminal slots, snapshots, and agent traffic handling.

### 2. Keep the existing terminal implementation unchanged

The spike is additive. It must not modify the behavior or compatibility of existing production terminal APIs:

- Do not change `TerminalStreamOpcode` semantics.
- Do not change existing terminal snapshot payloads.
- Do not change `TerminalManager.createTerminal` behavior.
- Do not change existing terminal tab creation or attach behavior.
- Do not make production terminal output depend on the new test terminal runtime.

Small additive wiring changes are acceptable to mount the route and expose the `Test terminal` entry point, but the existing terminal data path should remain intact.

### 3. Spawn a default HOME shell per connection

Each `/api/test/terminal` WebSocket connection should spawn one PTY directly with `node-pty`:

- `cwd`: daemon process user's `HOME`
- `shell`: existing default shell resolution helper
- `env`: existing terminal environment helper where practical
- `rows`/`cols`: initial defaults until the browser sends a resize frame

Do not create this PTY through `TerminalManager.createTerminal`. The test route should bypass server-side headless xterm parsing, terminal snapshots, terminal listing, and attach state.

The PTY should be killed when the WebSocket closes. Stopping the daemon should also close active test sockets and kill active test PTYs.

### 4. Match ttyd's transmission shape

Use binary WebSocket messages with a one-byte command prefix, modeled after ttyd:

```text
server -> browser:
  OUTPUT command byte + raw PTY output bytes

browser -> server:
  INPUT command byte + UTF-8 input bytes
  RESIZE command byte + small JSON resize payload
```

The browser side should set `binaryType = "arraybuffer"`. Output handling should pass the output payload to xterm as bytes, preferably via `Uint8Array.subarray(1)`, and call `xterm.write(bytes)`.

The app should not decode output bytes into a JS string before rendering. Browser input starts as xterm string data and must be encoded to bytes for the WebSocket. Use `TextEncoder.encodeInto()` where practical to match ttyd's allocation-light input path.

Resize may use a small JSON payload after the command byte because it is low-frequency control data.

### 5. Add an app test terminal surface, not a standalone page

Place a `Test terminal` button to the right of the `New terminal` tab action. Activating it should open an ephemeral test terminal surface in the terminal tab area.

The test terminal surface should:

- connect to the active daemon's `/api/test/terminal` WebSocket URL
- own the browser WebSocket connection in the DOM/xterm runtime as directly as possible
- write output bytes directly into xterm
- send xterm input bytes directly over the WebSocket
- send resize control frames when xterm fit dimensions change
- close the WebSocket and PTY when the test terminal surface is closed

The test terminal should be visibly identifiable as a test/debug terminal and should not appear in the persisted terminal list.

### 6. Treat security as a spike constraint

`/api/test/terminal` exposes a default shell in `HOME`, so it must remain a debug/test capability. The endpoint should be reachable only through the daemon access paths intended for this spike and should not be advertised as a production terminal API.

This change should not add relay-specific behavior or external public exposure. If the implementation discovers that the existing daemon HTTP surface would expose this route more broadly than intended, gate the route behind an explicit development/test flag before implementation proceeds.

### 7. Add focused smoke tests rather than broad app e2e

Tests should cover the debug module directly:

- the daemon HTTP server upgrades `/api/test/terminal`
- a WebSocket client can connect and receive PTY output as binary command frames
- binary input frames reach the PTY
- resize control frames call the PTY resize path
- socket disconnect terminates the test PTY
- daemon shutdown closes active test sockets and terminates active test PTYs
- the app test terminal runtime writes received bytes to xterm without output `TextDecoder`

Full app e2e is optional; focused server and runtime tests are enough for the spike unless manual verification reveals integration issues.

## Risks / Trade-offs

- [The test endpoint exposes shell access] -> Keep it debug/test scoped, do not advertise it as a production API, and gate it if the daemon route would be exposed too broadly.
- [The benchmark may not represent production UX] -> Treat it as a baseline only; compare it against the production path to identify overhead.
- [Adding a test terminal button can confuse users] -> Label it explicitly as `Test terminal` and keep it ephemeral/non-persisted.
- [Direct `node-pty` duplicates some terminal setup logic] -> Reuse shell/env helpers where practical, but do not route live output through production terminal session subscriptions.
- [Browser byte rendering may require runtime changes] -> Keep changes additive to the test terminal runtime and do not change production `TerminalEmulator` output handling unless a later production optimization change requires it.
- [Windows shell behavior may differ] -> Use existing default shell resolution and keep tests platform-tolerant.

## Migration Plan

- Add the daemon `/api/test/terminal` route as a debug/test capability.
- Add the app `Test terminal` button and ephemeral test terminal surface.
- Do not change existing terminal APIs or persisted terminal state.
- If the spike is later replaced by production optimizations, remove or keep the test route/button as a hidden benchmark tool without user-facing migration.

## Open Questions

- Should `/api/test/terminal` be enabled unconditionally in development builds, hidden behind a feature flag, or guarded by a debug setting?
- Should the first implementation include simple browser-side latency counters, or should measurement remain external through Playwright/manual checks?
