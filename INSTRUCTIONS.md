# Project Instructions

## Purpose

Build a browser homepage with a graphical RPG style, positioned as the launcher
entry for "The Earth Online".

## Non-Negotiable Rules

- Use English for all project content, code comments, docs, and UI copy.
- Only internationalization resources may contain non-English language text.
- Keep the stack full TypeScript with pure Next.js.
- Use ESLint for linting and Prettier for source formatting.
- Use `pnpm` for dependency and script management.

## Product Direction (Current)

- Primary RPG systems in scope:
  - Quest system
  - Achievement system
- Earth Online systems should evolve as modular RPG components that can be enabled independently.
- Initial phase goal:
  - Deliver a focused MVP with clear progression feedback.

## Engineering Notes

- Prefer simple architecture over early abstraction.
- Keep implementation compatible with App Router conventions.
- Keep game domain behavior inside module folders (for example `lib/github-module`) and keep API routes as thin wrappers.
- Add tests and stricter quality gates after core scaffolding is stable.
