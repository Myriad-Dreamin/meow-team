## 1. Scope Alignment

- [ ] 1.1 Confirm the canonical request/PR title is `feat(platform/ugit): support ugit platform` and keep the change scoped to ugit adapter wiring, repository-aware platform resolution, and provider-aware pull-request tracking
- [ ] 1.2 Keep the existing repository-local `meow-team.platform` path as the only platform selection mechanism and leave ugit machine provisioning out of scope

## 2. Platform Adapter

- [ ] 2.1 Add `lib/platform/ugit` helper and adapter modules that resolve ugit repository context, honor repo-local `ugit.machine`, and invoke the ugit pull-request commands needed for publish and synchronization
- [ ] 2.2 Register `ugitPlatformAdapter` in `lib/platform/index.ts` and update shared platform result types so ugit publish and pull-request flows can persist provider identifiers plus nullable browser URLs while GitHub remains the default when config is unset

## 3. Harness Metadata And Copy

- [ ] 3.1 Extend `lib/team/types.ts`, `lib/team/history.ts`, and related persistence helpers so pull-request and pushed-commit records support provider `ugit` and optional URL fields without regressing existing GitHub or `local-ci` data
- [ ] 3.2 Update `lib/team/coding/*`, `lib/team/executing/*`, and relevant help text or tests to replace GitHub-only publish and pull-request wording with provider-aware activity strings for ugit-backed repositories

## 4. Validation

- [ ] 4.1 Add or update targeted Vitest coverage for platform resolution, ugit adapter behavior, and harness metadata or activity rendering when ugit URLs are unavailable
- [ ] 4.2 Run `pnpm fmt`, `pnpm lint`, the targeted Vitest coverage, and `pnpm build`
