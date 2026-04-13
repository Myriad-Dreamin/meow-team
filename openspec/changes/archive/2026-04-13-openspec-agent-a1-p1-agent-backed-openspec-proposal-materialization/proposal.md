## Why

Replace hardcoded markdown generation in lib/team/openspec.ts with a dedicated Codex/OpenSpec artifact agent, preserve the current proposal dispatch and approval flow, and add regression coverage for artifact creation and failure handling. Replace hardcoded OpenSpec proposal markdown generation with an agent-backed materialization flow and cover the new planner path with tests. This proposal is one candidate implementation for the request: Currently, `lib/team/openspec.ts` generates markdown by hard-coded script, however we would like to use agent to generate these markdown files. Refer to `lib/team/roles/request-title.ts` to check how we invoke agent to create openspec using openspec skill.

## What Changes

- Introduce the `openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization` OpenSpec change for proposal "Agent-backed OpenSpec proposal materialization".
- Replace hardcoded markdown generation in lib/team/openspec.ts with a dedicated Codex/OpenSpec artifact agent, preserve the current proposal dispatch and approval flow, and add regression coverage for artifact creation and failure handling.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization`: Replace hardcoded markdown generation in lib/team/openspec.ts with a dedicated Codex/OpenSpec artifact agent, preserve the current proposal dispatch and approval flow, and add regression coverage for artifact creation and failure handling.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(oht/workflow): Agent-backed OpenSpec proposal materialization`
- Conventional title metadata: `feat(oht/workflow)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal 1 is the preferred path. Objective: Replace the hardcoded markdown builders in lib/team/openspec.ts with a dedicated agent-backed OpenSpec materializer that uses the local OpenSpec skill workflow while keeping the existing planner dispatch lifecycle stable. Execution outline: 1. Add a new structured agent/helper for OpenSpec proposal materialization, following the same invocation pattern used by existing role helpers. 2. Pass proposal metadata into that agent from the planner materialization path so the agent writes the OpenSpec artifacts in the planner worktree instead of relying on inline string templates. 3. Keep existing change creation, worktree management, commit creation, and branch ref updates unchanged except for the artifact-generation step. 4. Add tests for dependency registration, prompt/invocation orchestration, and error paths when artifact generation does not leave the expected OpenSpec files on disk. Approval notes: - This is a single refactor proposal; there is no separate proposal worth scheduling independently. - Coding and review lanes should remain idle until a human approves this proposal.
