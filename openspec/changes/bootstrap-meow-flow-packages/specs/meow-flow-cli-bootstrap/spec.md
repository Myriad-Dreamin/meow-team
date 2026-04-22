## ADDED Requirements

### Requirement: Workspace includes Meow Flow CLI package
The repository SHALL define `meow-flow` as a pnpm workspace CLI package located at `packages/meow-flow` with a runnable bin entrypoint and TypeScript build and typecheck scripts aligned with the repository's CLI package conventions.

#### Scenario: Developer builds the CLI package
- **WHEN** a developer runs the Meow Flow CLI build script
- **THEN** the package SHALL emit a compiled CLI entrypoint that can be invoked by its bin wrapper

### Requirement: Root alias runs the Meow Flow CLI from source
The repository root SHALL expose a `cli:meow-flow` script that executes the Meow Flow CLI source entrypoint for local development workflows.

#### Scenario: Developer invokes the root alias for help
- **WHEN** a developer runs `npm run cli:meow-flow -- --help`
- **THEN** the root script SHALL execute the Meow Flow CLI and print help output

### Requirement: Meow Flow CLI reports its version
The Meow Flow CLI SHALL print its package version and exit successfully when invoked with the `--version` flag.

#### Scenario: Version flag is provided
- **WHEN** the CLI is invoked with `--version`
- **THEN** it SHALL print the package version string and exit with a success status

### Requirement: Meow Flow CLI prints usage help
The Meow Flow CLI SHALL print usage-oriented help text and exit successfully when invoked with the `--help` flag.

#### Scenario: Help flag is provided
- **WHEN** the CLI is invoked with `--help`
- **THEN** it SHALL print command usage and available options and exit with a success status
