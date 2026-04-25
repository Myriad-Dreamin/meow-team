## Context

Paseo's production terminal path is intentionally integrated with the workspace UI, session store, terminal retention, relay compatibility, and app lifecycle handling. That integration adds overhead compared with short-path web terminals such as a direct PTY WebSocket page. The current path also shares the daemon WebSocket with agent stream JSON, performs server-side headless terminal parsing before live output is emitted, and lets xterm DOM changes feed React state through broad DOM observation.

The direct terminal HTTP spike will provide a short-path baseline. This change defines the production optimization path that should follow once the baseline confirms where overhead is concentrated.

## Goals / Non-Goals

**Goals:**

- Reduce active terminal output latency and input echo latency.
- Reduce per-output-frame work in React Native and the Expo DOM bridge.
- Batch client-side terminal writes without breaking byte ordering.
- Remove terminal-render-induced React churn from broad DOM subtree observers.
- Add server-side backpressure so slow clients do not accumulate unbounded stale output.
- Preserve existing terminal semantics, resize behavior, attach behavior, and backward-compatible schemas.
- Add performance instrumentation and focused tests so regressions are visible.

**Non-Goals:**

- Replacing xterm.js as the production terminal renderer in this change
- Redesigning the entire daemon session protocol
- Removing the existing mobile terminal UI controls
- Changing terminal behavior for older app clients in a breaking way
- Solving relay transport performance comprehensively

## Decisions

### 1. Optimize the current xterm-based stack before replacing the renderer

Keep xterm.js as the production renderer while shortening the path around it. The initial target is to reduce scheduling, bridging, and transport overhead. Renderer replacement should remain out of scope unless measurements show xterm rendering itself is the dominant cost after path shortening.

This is lower risk because the app already depends on xterm behavior for ANSI parsing, alternate screen, Unicode, mouse/input handling, and add-ons.

### 2. Move active terminal stream handling closer to the DOM runtime

For focused terminal panes, terminal output should be deliverable to the DOM terminal runtime without every output chunk traversing React Native component callbacks. The implementation can do this by giving the DOM terminal component enough connection information to subscribe directly, or by adding a terminal-specific bridge that batches messages before crossing into DOM.

The preferred direction is DOM-direct for active terminal output because it most closely matches the short-path baseline. The React Native shell should still own workspace focus, terminal identity, theme, modifier controls, and lifecycle state.

### 3. Batch terminal writes in the DOM runtime

The DOM terminal runtime should accumulate output bytes/text and call `xterm.write()` on a frame or short timer boundary. If an xterm write is already in flight, new output should merge into pending output instead of becoming many queued write operations.

This preserves byte order while reducing per-frame callback overhead. It also gives the runtime a natural place to record queue depth and write duration metrics.

### 4. Remove broad xterm DOM subtree observation

Terminal scrollbar and viewport metrics should not rely on a `MutationObserver` over the xterm host subtree. Replace broad mutation observation with scroll events, xterm buffer/scroll events where available, `ResizeObserver` on stable container nodes, and `requestAnimationFrame` throttling.

This prevents xterm's own rendering DOM mutations from causing React state updates during output bursts.

### 5. Add explicit terminal stream backpressure on the server

Each active terminal stream should track client send pressure. When a socket or session exceeds a high watermark, the server should stop emitting every output chunk to that client and mark it as needing catch-up. Once pressure drops or the client requests/receives catch-up, the server should send a snapshot or equivalent compact state rather than replaying stale output forever.

Input and resize frames should remain high priority and must not wait behind stale output for that same terminal.

### 6. Decouple live output forwarding from headless snapshot parsing where safe

Live PTY output should be forwarded to active clients as soon as practical. Server-side headless xterm should continue to maintain state for capture/snapshot, but live forwarding should not be gated on the headless `write()` callback if measurements show that callback is part of the latency budget.

The implementation must preserve snapshot consistency. If full decoupling is risky, use a staged approach: instrument headless write latency first, then allow fast-path forwarding only for active streams while keeping snapshot maintenance asynchronous.

### 7. Keep attach state lighter and backward-compatible

Existing clients must continue to parse current terminal snapshot messages. Newer clients can opt into lighter attach behavior, such as serialized ANSI replay, visible-grid-only attach, or a binary/RLE snapshot format. Any new fields or modes must be optional and negotiated so older clients keep working.

This respects Paseo's compatibility rule that old mobile clients may talk to newer daemons.

## Risks / Trade-offs

- [DOM-direct stream handling can duplicate daemon client logic] -> Keep the direct path terminal-specific and share protocol helpers rather than forking broad session behavior.
- [Batching can increase latency if the window is too large] -> Start with frame-boundary or sub-16ms batching and measure p50/p95 input echo.
- [Backpressure catch-up can lose intermediate scrollback for slow clients] -> Use snapshot catch-up only when the client is already behind; preserve live semantics for healthy clients.
- [Decoupling live forwarding from headless parsing can create snapshot races] -> Add tests around attach-after-output and capture behavior before enabling the fast path.
- [Protocol changes can break old app clients] -> Add optional fields/modes only and keep current snapshot/output behavior as fallback.
- [Performance fixes can make tests flaky] -> Use deterministic perf probes for relative metrics and keep hard budgets limited to stable scenarios.

## Migration Plan

- Land instrumentation first so current queue depth, write latency, and buffered output are visible.
- Apply client-side DOM batching and observer reduction behind normal code paths because they do not require server protocol changes.
- Add server backpressure in a backward-compatible way using existing stream state and current snapshot fallback.
- Introduce any lighter attach/snapshot mode as opt-in for clients that advertise support.
- Keep rollback simple by retaining the existing terminal subscription and snapshot path until the optimized path is validated.

## Open Questions

- Should the first production shortening step be true DOM-direct subscription, or a lower-risk batched bridge from React Native to DOM?
- What high and low watermark values should govern terminal output backpressure on direct, local, and relay connections?
- Should terminal traffic get its own WebSocket, or should the current shared connection gain priority scheduling first?
- Which lightweight snapshot format gives the best benefit with the least protocol risk?
