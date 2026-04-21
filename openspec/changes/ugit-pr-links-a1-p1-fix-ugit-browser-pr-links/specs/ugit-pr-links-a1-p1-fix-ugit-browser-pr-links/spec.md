## ADDED Requirements

### Requirement: Resolve repository-local ugit browser server configuration

The system SHALL resolve a browser base URL for ugit repositories from a
repository-local git config setting and SHALL default that browser base URL to
`http://localhost:17121/` when no explicit override is configured.

#### Scenario: Default ugit browser base URL applies when unset

- **WHEN** platform operations need a browser link for a repository whose
  platform is `ugit` and no repository-local ugit browser base URL is set
- **THEN** the system SHALL use `http://localhost:17121/` as the browser base
  URL
- **AND** returned ugit browser links SHALL join paths under that base URL
  without duplicating or dropping slashes

#### Scenario: Owner sets an explicit ugit browser base URL

- **WHEN** the owner runs
  `meow-team config ugit base-url http://ugit.example.test/review/`
- **THEN** the CLI SHALL write
  `http://ugit.example.test/review/` to the repository-local git config key
  used for ugit browser base URLs
- **AND** the command SHALL report that the repository-local ugit browser base
  URL has been updated

### Requirement: Derive ugit browser repository URLs from stable repository metadata

The system SHALL derive the ugit browser repository slug from stable
repository metadata, preferably the repository's `upstream` remote, and SHALL
not derive that browser slug from `.data/repos/<name>` or other `origin`
transport storage paths.

#### Scenario: Local-path origin still resolves a browser repository URL

- **WHEN** a ugit repository has an `origin` transport URL like
  `/home/kamiyoru/work/ts/ugit/.data/repos/revival.git`
- **AND** stable repository metadata identifies the browser slug
  `Myriad-Dreamin/revival`
- **THEN** the ugit browser repository URL SHALL resolve to
  `http://localhost:17121/Myriad-Dreamin/revival`
- **AND** the system SHALL not reuse the `.data/repos/revival` storage path as
  the browser repository slug

#### Scenario: Ssh origin still resolves the same browser repository URL

- **WHEN** a ugit repository has an `origin` transport URL like
  `ssh://ugit.example.test/srv/ugit/.data/repos/revival.git`
- **AND** stable repository metadata identifies the browser slug
  `Myriad-Dreamin/revival`
- **THEN** the ugit browser repository URL SHALL still resolve to
  `http://localhost:17121/Myriad-Dreamin/revival`
- **AND** the `origin` fetch and push URLs SHALL remain available as transport
  metadata for git and ugit CLI operations

### Requirement: Generate ugit pull-request browser links from the browser repository URL

The system SHALL build ugit pull-request URLs from the resolved browser
repository URL and SHALL emit the pull-request route as
`/pull-requests/<id>`.

#### Scenario: Newly created ugit pull request returns a browser URL

- **WHEN** ugit pull-request creation resolves pull request `6` for browser
  repository URL `http://localhost:17121/Myriad-Dreamin/revival`
- **THEN** the returned PR URL SHALL be
  `http://localhost:17121/Myriad-Dreamin/revival/pull-requests/6`
- **AND** the returned URL SHALL not contain `#pull-request=6`

#### Scenario: Existing ugit pull request refresh keeps the browser URL shape

- **WHEN** ugit pull-request synchronization refreshes existing pull request
  `6` for browser repository URL
  `http://localhost:17121/Myriad-Dreamin/revival`
- **THEN** the returned PR URL SHALL remain
  `http://localhost:17121/Myriad-Dreamin/revival/pull-requests/6`
- **AND** the URL shape SHALL be independent of whether `origin` is a local
  path or an ssh transport URL

### Requirement: Preserve GitHub link behavior while fixing ugit browser links

The system SHALL keep GitHub repository and pull-request link generation
unchanged while adding ugit browser-link support.

#### Scenario: GitHub repositories continue using existing link generation

- **WHEN** platform operations run for a repository whose platform is unset or
  explicitly `github`
- **THEN** the system SHALL keep using the existing GitHub repository, branch,
  commit, and pull-request URL generation behavior
- **AND** no ugit browser base URL config SHALL be required for GitHub links

### Requirement: Preserve canonical title metadata in the materialized artifacts

The system SHALL carry the canonical request/PR title
`fix: correct ugit PR links` and conventional-title metadata `fix` through the
materialized OpenSpec artifacts without changing the approved change path
`ugit-pr-links-a1-p1-fix-ugit-browser-pr-links`.

#### Scenario: Materialized artifacts mirror approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `fix: correct ugit PR links`
- **AND** conventional-title metadata SHALL stay explicit instead of being
  encoded into the OpenSpec change path
