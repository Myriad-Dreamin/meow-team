## ADDED Requirements

### Requirement: Daemon exposes a test terminal WebSocket endpoint
The daemon SHALL expose an additive debug/test WebSocket endpoint at `/api/test/terminal` on the existing daemon HTTP server.

#### Scenario: Test terminal WebSocket upgrades on the daemon HTTP server
- **WHEN** an authorized app client opens a WebSocket connection to `/api/test/terminal`
- **THEN** the daemon upgrades the request on the existing daemon HTTP server
- **AND** the connection does not use the production daemon session WebSocket protocol

#### Scenario: Existing production terminal protocol remains unchanged
- **WHEN** the test terminal endpoint is added
- **THEN** existing terminal stream opcodes, terminal snapshot payloads, terminal subscriptions, and terminal input messages remain backward-compatible
- **AND** existing production terminal tabs continue to use the current terminal path

### Requirement: Test endpoint owns a default HOME shell PTY
The `/api/test/terminal` endpoint SHALL create one daemon-owned PTY per WebSocket connection using the default shell in the daemon process user's `HOME`.

#### Scenario: Connection starts a default shell in HOME
- **WHEN** a client connects to `/api/test/terminal`
- **THEN** the daemon starts a PTY with the default terminal shell
- **AND** the PTY working directory is the daemon process user's `HOME`

#### Scenario: Test PTY bypasses production terminal session state
- **WHEN** the test PTY is created
- **THEN** it is not registered as a production `TerminalManager` terminal
- **AND** it does not emit production terminal snapshots, terminal list updates, or terminal stream subscription events

### Requirement: Test terminal uses ttyd-style byte transport
The test terminal SHALL forward terminal I/O using binary WebSocket frames shaped like ttyd command frames.

#### Scenario: PTY output reaches the browser as binary bytes
- **WHEN** the test PTY emits output
- **THEN** the daemon sends a binary WebSocket frame with one output command byte followed by raw PTY output bytes
- **AND** the output payload is not JSON-encoded or base64-encoded

#### Scenario: Browser input reaches the PTY as bytes
- **WHEN** the browser xterm emits input data
- **THEN** the app sends a binary WebSocket frame with one input command byte followed by UTF-8 input bytes
- **AND** the daemon writes those bytes to the PTY in order

#### Scenario: Browser resize updates PTY size
- **WHEN** the browser terminal reports a new row and column size
- **THEN** the app sends a resize control frame to `/api/test/terminal`
- **AND** the daemon resizes the test PTY to the reported dimensions

### Requirement: App exposes a Test terminal entry point
The app SHALL provide a `Test terminal` button to the right of the existing `New terminal` tab action.

#### Scenario: User opens a test terminal
- **WHEN** the user presses `Test terminal`
- **THEN** the app opens an ephemeral test terminal surface
- **AND** that surface connects directly to `/api/test/terminal`
- **AND** the surface is visually distinguishable from normal production terminals

#### Scenario: Test terminal does not alter normal terminal tabs
- **WHEN** a test terminal is opened or closed
- **THEN** existing production terminal tabs, terminal lists, terminal snapshots, and terminal creation behavior are unchanged

### Requirement: Test terminal renders output through a direct xterm byte path
The test terminal surface SHALL render PTY output by writing received bytes directly to browser xterm.

#### Scenario: Output bytes are written to xterm
- **WHEN** the test terminal receives an output frame
- **THEN** the browser extracts the output payload as a `Uint8Array`
- **AND** passes that byte payload to `xterm.write()`
- **AND** does not decode the output payload through `TextDecoder` before rendering

### Requirement: Test terminal lifecycle is cleaned up
The daemon and app SHALL close test terminal resources when the test terminal disconnects or the daemon stops.

#### Scenario: Browser disconnect terminates the test PTY
- **WHEN** the test terminal WebSocket disconnects
- **THEN** the daemon terminates the associated PTY
- **AND** no test terminal listeners remain attached for that connection

#### Scenario: Daemon shutdown closes active resources
- **WHEN** the daemon stops
- **THEN** active `/api/test/terminal` WebSocket connections are closed
- **AND** active test PTY processes are terminated
