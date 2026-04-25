## Why

Paseo's terminal feels less fluid than VS Code Remote because terminal output travels through more layers than necessary and shares scheduling with broader app traffic. After the direct HTTP spike establishes a baseline, we need a production-oriented optimization plan that shortens the hot path while preserving mobile compatibility and existing terminal behavior.

## What Changes

- Move terminal output closer to a direct `terminal stream -> DOM xterm` path for active terminal panes, reducing per-chunk React Native and Expo DOM bridge overhead.
- Add client-side output batching so multiple terminal frames can be coalesced before `xterm.write()` without breaking ordering.
- Remove or heavily throttle terminal DOM subtree observation that converts xterm rendering changes into React state pressure.
- Add server-side terminal stream backpressure and prioritization so slow clients do not accumulate unbounded stale output and user input/resize remain responsive.
- Decouple live PTY forwarding from server-side headless xterm snapshot maintenance where safe, so live output is not gated by server snapshot parsing.
- Define lighter snapshot/reconnect behavior for terminal attach, avoiding large cell-object payloads on the critical path.
- Keep all existing terminal message schemas backward-compatible with old clients and daemons.

## Capabilities

### New Capabilities

- `terminal-streaming-performance`: Optimize terminal streaming, rendering, backpressure, and attach behavior while preserving existing terminal semantics.

### Modified Capabilities

None.

## Impact

- `packages/app` terminal pane, DOM terminal runtime, stream controller, and terminal scrollbar/resize behavior
- `packages/server` terminal manager/session streaming, output coalescing, binary frame emission, and snapshot generation
- `packages/server/src/client` daemon client terminal stream handling and transport metrics
- Potential optional debug metrics for terminal queue depth, write batching, and backpressure state
- Focused terminal performance tests and targeted typecheck/format verification
