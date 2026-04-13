## Context

Meow Team currently exposes its operator experience through the Next.js app and
already serves the core workflow surface through `app/api/team/*` routes such
as status, threads, run, approval, feedback, and logs. This change adds a new
Android delivery surface under `crates/meow-team-android`, but the backend,
persistence, and workflow orchestration remain in the existing app. The design
challenge is deciding how to bootstrap an Android shell with `cargo-ndk`
without pretending the repository is suddenly mobile-first or moving business
logic out of the Next.js server.

## Goals / Non-Goals

**Goals:**

- Add a plan for an Android application package under `crates/meow-team-android`.
- Bootstrap the package as a `cargo-ndk` hello-world app that proves the repo
  can build and launch the first Android shell.
- Keep the existing Next.js backend as the source of truth for reads and
  mutations.
- Make the Android-to-backend GET/POST contract explicit enough that the first
  implementation can be built incrementally.
- Define a local workflow for running the Android app alongside the backend.

**Non-Goals:**

- Reimplement harness orchestration, persistence, or long-running agent logic
  inside the Android process.
- Replace the existing Next.js app with an Android-only product.
- Finalize every mobile interaction pattern, offline behavior, or production
  distribution path in the first milestone.
- Commit the repository to a broad Rust migration outside the Android package
  boundary.

## Decisions

### Place the Android surface in `crates/meow-team-android`

The Android application package will live in `crates/meow-team-android` so the
platform-specific files, toolchain notes, and app entry points stay isolated
from the current TypeScript web app.

Alternative considered: place the Android client under `packages/` or treat it
as a Next.js-responsive-only effort. This was rejected because the request
calls for an Android application boundary and a `cargo-ndk` bootstrap path.

### Bootstrap with `cargo-ndk` and a minimal Android shell

The first implementation should focus on a buildable hello-world Android shell
that proves `cargo-ndk` can compile the Rust package and that the app can be
launched on an emulator or device. Any Android wrapper files needed to host the
Rust build output should stay colocated with the crate under
`crates/meow-team-android`.

Alternative considered: start by designing the full meow-team mobile UI before
proving the toolchain. This was rejected because the highest risk is the new
platform bootstrap, not the final screen layout.

### Keep Next.js as the only backend

The Android app will call the existing Next.js backend over HTTP and will not
import or re-host backend workflow logic on-device. The initial bridge should
target the current `app/api/team/*` endpoints or explicit successors exposed by
the app, keeping one execution authority for runs, approvals, persistence, and
API evolution.

Alternative considered: share server modules directly with the Android app or
add Android-specific workflow logic. This was rejected because runtime
constraints differ and hidden coupling would make debugging and deployment more
fragile.

### Make backend connection explicit and configurable

The Android shell should resolve a backend base URL from app configuration and
use that value for all GET/POST calls. The shell should also surface connection
state so failures are visible and actionable instead of looking like blank or
stale mobile UI.

Alternative considered: hardcode a localhost URL. This was rejected because it
would only work for a narrow local setup and would not support alternate ports,
LAN testing, or remote environments.

### Route Android workflows through repository-owned scripts when possible

Even though the Android package uses Rust and `cargo-ndk`, repository-level
developer entry points should still be surfaced through `pnpm` scripts or docs
that clearly show how the Android toolchain fits into the existing project
workflow. This keeps the repo aligned with the current `pnpm`-centric
management rules while containing the platform exception.

Alternative considered: leave Android build and run steps completely detached
from the repository workflow. This was rejected because it would make the new
surface harder to discover, document, and validate.

## Risks / Trade-offs

- [Rust Android tooling is new to this repository] -> Start with a hello-world
  milestone and keep the crate isolated so failures do not spill into the
  existing Next.js workflow.
- [Android UI architecture is still open] -> Keep the first milestone focused
  on a thin shell plus backend bridge, then choose richer native or hybrid UI
  patterns after the toolchain works.
- [Endpoint drift between app and Android client] -> Reuse explicit
  `app/api/team/*` contracts or codified successors and add typed request or
  response models when implementation begins.
- [Repository rules are TypeScript-first] -> Document the Android crate as a
  bounded platform exception and keep repo-facing commands discoverable through
  `pnpm` wrappers or equivalent docs.
- [Local setup friction on devices and emulators] -> Define a minimal backend
  URL configuration flow and document the expected local runtime path before
  expanding the mobile feature set.

## Migration Plan

1. Create the roadmap and OpenSpec artifacts for the `android/workspace-ui`
   scope.
2. Scaffold `crates/meow-team-android` with the Android shell, Rust package,
   and the first documented `cargo-ndk` build path.
3. Add the configurable HTTP bridge for reading and mutating state against the
   Next.js backend.
4. Move the first meow-team mobile workflows into the Android shell and
   validate the connection and degraded states.

## Open Questions

- What is the thinnest Android wrapper shape that still counts as the requested
  hello-world app while remaining compatible with `cargo-ndk`?
- Should the first mobile UI render native screens, a WebView-hosted surface,
  or a hybrid shell once the bootstrap milestone is complete?
- Which existing team endpoints are sufficient for the first Android read or
  mutation workflow, and do any request or response types need to be extracted
  before implementation?
