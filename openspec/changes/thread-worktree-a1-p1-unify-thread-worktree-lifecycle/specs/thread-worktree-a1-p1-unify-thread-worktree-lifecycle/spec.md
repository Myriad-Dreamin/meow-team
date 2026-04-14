## ADDED Requirements

### Requirement: Repository-backed threads claim and prepare one managed worktree before planner execution
The system SHALL resolve or claim exactly one managed `meow-N` worktree for a
living repository-backed thread before request-title or planner agents run, and
SHALL prepare that checkout from the repository base branch before any
planner-side Codex invocation uses it.

#### Scenario: Initial planning claims and prepares a slot
- **WHEN** a new repository-backed thread starts planning and a managed slot is available
- **THEN** the system SHALL claim exactly one managed slot for that thread
- **AND** SHALL persist the resolved worktree in thread state
- **AND** SHALL ensure the checkout exists on disk before running request-title or planner agents

#### Scenario: No free slot is available
- **WHEN** other living repository-backed threads already own every managed slot
- **THEN** the system SHALL block the new planning run with a thread-capacity failure
- **AND** SHALL NOT reuse a slot already claimed by another living thread

### Requirement: Thread worktree ownership is reused across planning and approved execution
The system SHALL reuse the persisted thread-owned worktree across resumed
planning, replanning, proposal approval, coding, review, and final archive
preparation until the thread is archived.

#### Scenario: Resume or replan uses the prior slot
- **WHEN** the same living thread resumes planning or re-enters metadata generation
- **THEN** the system SHALL reuse its previously claimed slot
- **AND** SHALL NOT claim an additional managed slot for that thread

#### Scenario: Approved work keeps the same slot
- **WHEN** an approved proposal enters coder, reviewer, or final archive execution
- **THEN** the system SHALL continue using the thread-owned managed worktree for that thread
- **AND** SHALL NOT create a separate planner-only managed worktree

### Requirement: Archiving releases the live thread worktree claim
The system SHALL remove an inactive thread's managed worktree from active claim
resolution when the thread is archived, while allowing archived assignment or
lane metadata to remain available for audit.

#### Scenario: Archive frees a slot for a future thread
- **WHEN** an inactive thread with a claimed managed worktree is archived
- **THEN** the system SHALL clear its live `threadWorktree` claim
- **AND** SHALL allow a future repository-backed thread to claim that freed slot

#### Scenario: Archived metadata does not block capacity
- **WHEN** active claim resolution scans living threads
- **THEN** archived threads SHALL NOT contribute slot ownership even if archived assignments retain `threadSlot`, `plannerWorktreePath`, or lane worktree metadata

### Requirement: Materialized artifacts preserve request title metadata
The materialized OpenSpec artifacts SHALL preserve the canonical request/PR
title `fix(thread/worktree): unify thread worktree lifecycle` and
conventional-title metadata `fix(thread/worktree)` without changing the
approved change name.

#### Scenario: Proposal set mirrors approved metadata
- **WHEN** planner materializes this change
- **THEN** `proposal.md`, `design.md`, `tasks.md`, and this spec SHALL reference the canonical request/PR title `fix(thread/worktree): unify thread worktree lifecycle`
- **AND** SHALL keep `fix(thread/worktree)` as metadata rather than altering the change path `thread-worktree-a1-p1-unify-thread-worktree-lifecycle`
