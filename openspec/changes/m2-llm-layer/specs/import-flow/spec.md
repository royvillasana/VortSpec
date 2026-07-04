## MODIFIED Requirements

### Requirement: Import progress tracking
The Import Progress screen SHALL display the six pipeline stages (Parse, Style Mining, Token Inference, Structure Inference, DS Merge, Report) with per-stage status indicators: queued (gray), running (animated blue), done (green check), failed (red with error message). Stage 3 (Token Inference) and Stage 4 (Structure Inference) SHALL show the LLM model used when completed (e.g. "Done · gemini-2.0-flash").

#### Scenario: Pipeline stages progress
- **WHEN** an import job is running
- **THEN** the progress screen SHALL show each stage with its current status
- **AND** the active stage SHALL display a running animation

#### Scenario: LLM stage shows model info
- **WHEN** stage 3 or 4 completes using an LLM model
- **THEN** the stage card SHALL display the model name used (e.g. "google/gemini-2.0-flash-exp:free")

#### Scenario: Stage failure with retry
- **WHEN** a pipeline stage fails
- **THEN** that stage SHALL display a red error indicator with a human-readable reason
- **AND** a "Retry" button SHALL allow re-running the failed stage without re-running completed stages
