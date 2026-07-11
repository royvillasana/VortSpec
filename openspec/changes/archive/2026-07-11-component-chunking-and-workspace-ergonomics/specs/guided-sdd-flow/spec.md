## ADDED Requirements

### Requirement: Chunked component builds with per-chunk model routing
The guided flow SHALL build detected components in chunks of at most five rather than in a single run, and SHALL route each chunk to a model tier by complexity: chunks containing only atoms or molecules to Haiku, chunks containing an organism to Sonnet, never Opus or Fable. Each chunk SHALL run as a separate `claude -p` process using the existing `--model` routing.

#### Scenario: Twenty components build in chunks
- **WHEN** a project has 20 detected components with no source files and the user starts "build the rest"
- **THEN** the flow SHALL run four sequential build runs of five components each
- **AND** each run SHALL carry a `--model` tier chosen by the chunk's highest component level

### Requirement: Per-chunk Storybook and manifest refresh
After each chunk completes, the flow SHALL regenerate Storybook stories and refresh the design manifest for the components built so far, so partial results are usable before the whole set finishes.

#### Scenario: First chunk yields usable output
- **WHEN** the first chunk of five components finishes building
- **THEN** those five SHALL appear as built in the roster with Storybook stories and a manifest section
- **AND** the remaining chunks SHALL continue building

### Requirement: Chunked builds are cancelable and resumable
The chunked build SHALL be cancelable between chunks, and re-running SHALL skip components that already have a source file on disk.

#### Scenario: Cancel mid-run then resume
- **WHEN** the user cancels after the second of four chunks
- **THEN** the first two chunks SHALL remain built and consistent
- **AND** restarting the build SHALL resume from the unbuilt components without rebuilding the first two chunks
