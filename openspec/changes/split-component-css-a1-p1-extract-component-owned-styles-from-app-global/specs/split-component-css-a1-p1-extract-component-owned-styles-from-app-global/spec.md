## ADDED Requirements

### Requirement: Extract component-owned styles from `app/globals.css`
The system SHALL implement the approved proposal recorded in OpenSpec change `split-component-css-a1-p1-extract-component-owned-styles-from-app-global` and keep the work aligned with this proposal's objective: reorganize styling by moving component-owned rules out of `app/globals.css` into colocated CSS Modules, update the affected React components to consume module exports, and keep only global or intentionally shared stylesheet concerns in `app/globals.css`.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Extract component-owned styles from `app/globals.css`" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Global stylesheet retains only shared concerns
The system SHALL leave `app/globals.css` responsible for design tokens, element resets, layout-wide shell primitives, and classes that are intentionally shared across multiple components.

#### Scenario: Component-specific rules are audited
- **WHEN** the implementation identifies selectors in `app/globals.css` that belong to a single component or view
- **THEN** those selectors SHALL be moved out of the global stylesheet unless they are intentionally shared or ownership remains ambiguous

### Requirement: Component-owned rules use colocated CSS Modules
The system SHALL place clearly component-owned selector families into colocated `*.module.css` files and update the owning React components to consume module exports instead of relying on global class names.

#### Scenario: Owning components adopt migrated styles
- **WHEN** a selector family such as `client-exception-*`, `task-output-window-*`, `thread-chat-*`, `thread-command-editor*`, `team-request-editor*`, or workspace/sidebar/status-bar rules is determined to belong to a component
- **THEN** the owning component SHALL import the corresponding CSS Module
- **AND** the component SHALL reference the migrated classes through module exports

### Requirement: Component style extraction preserves framework constraints and parity
The system SHALL preserve existing UI behavior and visual parity while following Next.js App Router constraints that limit arbitrary component-level global CSS imports.

#### Scenario: Refactor validation runs after migration
- **WHEN** the stylesheet split changes multiple UI surfaces
- **THEN** the implementation SHALL validate the refactor with `pnpm fmt`, `pnpm lint`, and `pnpm build`
- **AND** the migrated components SHALL continue using CSS Modules instead of new plain global CSS imports

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `refactor(ui/styles): split component stylesheets` and conventional-title metadata `refactor(ui/styles)` through the materialized OpenSpec artifacts without encoding slash-delimited scope into the OpenSpec change path.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(ui/styles): split component stylesheets`
- **AND** the slash-delimited scope SHALL remain metadata instead of changing the proposal change path `split-component-css-a1-p1-extract-component-owned-styles-from-app-global`
