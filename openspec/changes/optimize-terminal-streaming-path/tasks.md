## 1. Baseline and instrumentation

- [ ] 1.1 Run or document the direct terminal HTTP spike baseline against the production terminal path.
- [ ] 1.2 Add or extend client terminal metrics for queue depth, renderer write count, write duration, and end-to-end commit timing.
- [ ] 1.3 Add or extend server terminal stream metrics for buffered pressure, catch-up state, and output frame counts.

## 2. Client hot path

- [ ] 2.1 Implement DOM terminal runtime output batching that preserves byte order.
- [ ] 2.2 Replace broad terminal subtree MutationObserver usage with scoped scroll, resize, or xterm event handling.
- [ ] 2.3 Add tests for batched output ordering, bounded runtime queue depth, and scrollbar accuracy.

## 3. Active terminal path shortening

- [ ] 3.1 Choose and implement the first path-shortening approach: DOM-direct subscription or a batched terminal-specific bridge.
- [ ] 3.2 Preserve existing terminal controls, focus behavior, theme updates, modifier keys, resize behavior, and fallback behavior.
- [ ] 3.3 Verify unsupported runtimes continue using the existing terminal path.

## 4. Server stream control

- [ ] 4.1 Add per-terminal-stream backpressure tracking and high/low watermark handling.
- [ ] 4.2 Add catch-up snapshot behavior for slow clients instead of replaying stale output.
- [ ] 4.3 Keep input and resize processing high priority while output catch-up is pending.
- [ ] 4.4 Add tests for slow clients, catch-up state, and post-catch-up terminal usability.

## 5. Live output and attach

- [ ] 5.1 Instrument server headless xterm write latency in the live output path.
- [ ] 5.2 Decouple healthy live output forwarding from headless snapshot parsing where tests show it is safe.
- [ ] 5.3 Introduce an optional lightweight attach mode for supporting clients while retaining the existing snapshot fallback.
- [ ] 5.4 Add compatibility tests for older snapshot behavior and attach-after-output consistency.

## 6. Verification

- [ ] 6.1 Run focused terminal unit tests and targeted browser/runtime tests.
- [ ] 6.2 Run manual terminal performance e2e with `PASEO_TERMINAL_PERF_E2E=1` when appropriate.
- [ ] 6.3 Run workspace typecheck and format before implementation completion.
