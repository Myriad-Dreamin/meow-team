## ADDED Requirements

### Requirement: Active terminal output path is shortened
The system SHALL provide an optimized active-terminal output path that reduces per-output-frame React Native and DOM bridge work while preserving existing terminal behavior.

#### Scenario: Focused terminal receives output with reduced app-layer dispatch
- **WHEN** a focused terminal pane is subscribed to terminal output
- **THEN** output is delivered to the DOM terminal runtime through the optimized terminal path
- **AND** each output frame does not require a React state update before reaching the terminal renderer

#### Scenario: Existing terminal path remains available as fallback
- **WHEN** the optimized terminal path is unavailable or unsupported by the client runtime
- **THEN** the app continues to render terminal output through the existing supported path
- **AND** terminal output, input, resize, and attach behavior remain functional

### Requirement: DOM terminal runtime batches writes safely
The DOM terminal runtime SHALL coalesce pending terminal output before calling the terminal renderer while preserving byte order.

#### Scenario: Multiple output frames are written as a single renderer operation
- **WHEN** multiple terminal output frames arrive before the next scheduled renderer flush
- **THEN** the runtime combines them in arrival order
- **AND** it calls the terminal renderer with the combined output

#### Scenario: In-flight renderer writes do not create unbounded operation queues
- **WHEN** terminal output arrives while a renderer write is in flight
- **THEN** the runtime appends the output to a pending buffer
- **AND** the runtime starts the next renderer write after the in-flight write commits

### Requirement: Terminal DOM observation is throttled and scoped
The terminal UI SHALL avoid broad DOM subtree observation that turns terminal renderer mutations into high-frequency React state updates.

#### Scenario: Output burst does not trigger per-mutation React updates
- **WHEN** the terminal renderer updates its internal DOM during a large output burst
- **THEN** terminal scrollbar or viewport state is not updated once per renderer DOM mutation
- **AND** any required metrics updates are throttled to animation frames or stable scroll/resize events

#### Scenario: Scrollbar remains accurate after scrollback changes
- **WHEN** terminal scrollback size or viewport offset changes
- **THEN** the custom scrollbar reflects the current scroll position and size
- **AND** the update does not require observing every xterm child mutation

### Requirement: Terminal stream backpressure protects slow clients
The daemon SHALL apply terminal-stream backpressure so slow clients do not receive unbounded stale output and input remains responsive.

#### Scenario: Slow client is marked for catch-up
- **WHEN** a terminal stream client's queued outbound data exceeds the configured high watermark
- **THEN** the daemon stops enqueuing every live output chunk for that client
- **AND** the daemon marks the stream as needing a catch-up state

#### Scenario: Catch-up uses terminal state instead of stale replay
- **WHEN** a slow terminal stream client becomes eligible for catch-up
- **THEN** the daemon sends a terminal snapshot or equivalent compact state to resynchronize the client
- **AND** the daemon does not replay all stale output chunks that accumulated while the client was slow

#### Scenario: Input and resize remain high priority
- **WHEN** a terminal stream has pending stale output for a slow client
- **THEN** input and resize messages from the client are still processed promptly
- **AND** they are not queued behind stale outbound output for that terminal

### Requirement: Live output forwarding is not unnecessarily gated by snapshot parsing
The daemon SHALL avoid unnecessary live-output latency caused by server-side snapshot maintenance.

#### Scenario: Live output can emit before snapshot parser commit when safe
- **WHEN** PTY output is received for an active terminal stream
- **THEN** the daemon forwards live output to healthy active clients as soon as the optimized stream policy allows
- **AND** maintaining server-side terminal state for snapshot or capture does not unnecessarily delay healthy live output

#### Scenario: Attach remains consistent after live output
- **WHEN** a client attaches to a terminal after recent live output
- **THEN** the attach state reflects output that has already been emitted
- **AND** capture and snapshot behavior remain consistent with the terminal's current state

### Requirement: Terminal attach state is lighter where supported
The system SHALL support a backward-compatible path for reducing terminal attach snapshot cost.

#### Scenario: New client opts into lightweight attach
- **WHEN** a client advertises support for a lightweight terminal attach mode
- **THEN** the daemon may send the lighter attach representation
- **AND** the client renders the terminal to an equivalent visible state

#### Scenario: Older client receives existing snapshot format
- **WHEN** a client does not advertise support for a lightweight terminal attach mode
- **THEN** the daemon sends terminal attach state using the existing compatible snapshot behavior
- **AND** the older client can parse and render the terminal

### Requirement: Terminal performance is measurable
The system SHALL expose enough targeted metrics or test probes to compare terminal latency and throughput before and after optimization.

#### Scenario: Client-side queue and renderer timing are measurable
- **WHEN** terminal performance probes are enabled
- **THEN** the app records output queue depth, renderer write count, renderer write duration, and end-to-end output commit timing
- **AND** the metrics are available to focused tests or debug logs

#### Scenario: Server-side send pressure is measurable
- **WHEN** terminal stream backpressure is active or output is sent
- **THEN** the daemon records buffered output pressure or equivalent backpressure state
- **AND** tests can assert that slow clients trigger catch-up behavior
