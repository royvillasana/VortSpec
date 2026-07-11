## ADDED Requirements

### Requirement: SDD-DE cycle rendered as a stepper

VortSpec SHALL render the SDD-DE cycle as a stepper whose stages mirror the CLI's steps exactly. Each stage card SHALL show its status (pending, running, needs review, approved, failed), a summary of what the stage does, and its artifacts.

#### Scenario: Stepper reflects stage status

- **WHEN** a stage is running, awaiting review, or has failed
- **THEN** its card shows the corresponding status and lists the artifacts the stage has produced so far

### Requirement: Methodology parity with the CLI

The guided flow SHALL NOT introduce a divergent methodology; where the app and the CLI would disagree, the CLI's methodology wins. VortSpec adds usability and gate enforcement only.

#### Scenario: Flow follows CLI steps

- **WHEN** a user advances through the guided flow
- **THEN** the sequence of steps matches the SDD-DE CLI cycle, with the app adding forms, gates, and progress rendering but no new methodology steps

### Requirement: Verification stages as review cards

The CLI's verification steps (e.g. visual-verify, adversarial review) SHALL render their outputs as review cards listing findings with severity, each individually approvable or sendable back for revision, reusing the issues/patch-card visual language.

#### Scenario: Verification produces findings

- **WHEN** a verification stage completes with findings
- **THEN** each finding renders as a card with a severity and per-finding approve / send-back actions
