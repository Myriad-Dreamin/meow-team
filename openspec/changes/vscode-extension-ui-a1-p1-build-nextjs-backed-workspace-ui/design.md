## Context

Meow Team currently ships its operator experience through the Next.js app. This
change adds a second delivery surface in the form of a VS Code extension under
`packages/vscode-extension`, but the backend, persistence, and workflow
orchestration stay in the existing app. The main design challenge is deciding
how thin the extension should stay while still feeling like a first-class
editor UI.

## Goals / Non-Goals

**Goals:**

- Add a plan for a VS Code extension package under `packages/vscode-extension`.
- Host the meow-team workspace inside VS Code through editor-native entry
  points and a webview-capable UI surface.
- Keep the Next.js backend as the source of truth for reads and mutations.
- Make the extension-to-backend GET/POST contract explicit enough that the
  first implementation can be built incrementally.
- Define a local workflow for running the extension alongside the backend.

**Non-Goals:**

- Reimplement harness orchestration, persistence, or long-running agent logic
  inside the extension host.
- Replace the existing Next.js app with an editor-only product.
- Finalize every visual detail or ancillary editor integration in the first
  implementation pass.

## Decisions

### Place the extension in `packages/vscode-extension`

The extension package will live in `packages/vscode-extension` so it stays
inside the existing workspace package boundary while still being clearly
treated as an editor delivery surface.

Alternative considered: keep the earlier `editors/vscode` path from the
proposal draft. This was rejected because the latest request explicitly asks
for `packages/vscode-extension`, which also matches the current
`pnpm-workspace.yaml` package glob.

### Use a webview-centered UI with editor-native entry points

The extension should provide commands, configuration, and one primary webview
workspace surface. This keeps the shell native to VS Code while allowing the
main UI to use the same web technologies the product already depends on.

Alternative considered: limit the first version to tree views or status-bar
contributions. This was rejected because the requested meow-team UI needs more
layout freedom than narrow native contributions provide.

### Keep Next.js as the only backend

The extension will call the existing Next.js backend over HTTP and will not
import or re-host backend workflow logic in the extension process. This keeps
one execution authority for runs, approvals, persistence, and API evolution.

Alternative considered: share server modules directly with the extension or run
backend logic in the extension host. This was rejected because runtime
constraints differ and hidden coupling would make deployment and debugging more
fragile.

### Make backend connection explicit and configurable

The extension should resolve a backend base URL from settings or connection UI
and use that value for all GET/POST calls. The workspace UI should also surface
connection state so failures are visible and actionable.

Alternative considered: hardcode a localhost URL. This was rejected because it
would work for a narrow local setup but would not support alternate ports,
remote hosts, or clear recovery when the backend moves.

### Prefer shared types over shared runtime

If the extension and app need common request or response shapes, the repository
should share typed contracts or lightweight client helpers rather than
cross-importing backend runtime code.

Alternative considered: duplicate request models in the extension. This was
rejected because drift between editor and web clients would become hard to
detect.

## Risks / Trade-offs

- [Webview complexity] -> Keep the extension shell thin and defer nonessential
  editor chrome until the core workspace works.
- [Endpoint drift between app and extension] -> Define the required GET/POST
  contract early and add integration coverage once implementation begins.
- [Operator setup friction] -> Add explicit scripts and docs for running the
  Next.js app and VS Code extension together in development.
- [Authentication ambiguity] -> Start with a clearly documented local
  connection model and leave remote auth hardening as a follow-up if it is not
  required for the first milestone.

## Migration Plan

1. Scaffold the extension package in `packages/vscode-extension` with manifest,
   build, packaging, and local install wiring.
2. Add commands, settings, and a minimal workspace webview shell.
3. Implement the HTTP bridge for GET/POST calls to the Next.js backend.
4. Move the first meow-team workflows into the extension UI and validate the
   connection and degraded states.

## Open Questions

- Should the first UI iteration render a locally bundled webview app that
  fetches backend data, or should it embed a remote page served by Next.js?
- What authentication or trust model should the extension use when the backend
  is not a local development server?
