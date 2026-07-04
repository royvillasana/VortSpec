# Capability: Inspector History

## Purpose

Patch history timeline with author attribution, linear undo, detail expansion, and version tracking for the Design Inspector.

## Requirements

### Requirement: Patch history timeline
The History panel SHALL display the project's patch history as a vertical timeline. Each entry SHALL show: a summary of the change, author attribution (user or LLM with icon), timestamp, and the patch operation type.

#### Scenario: History renders timeline entries
- **WHEN** user navigates to the History panel
- **THEN** patch entries SHALL render in reverse chronological order (newest first)
- **AND** each entry SHALL show summary, author, timestamp, and operation type

### Requirement: Author attribution
Each history entry SHALL display whether the patch was authored by a user (user icon) or by the LLM (AI icon). LLM-authored patches SHALL additionally show the approval status (approved/rejected).

#### Scenario: LLM-authored patch shows approval
- **WHEN** a patch was proposed by the LLM and approved by the user
- **THEN** the history entry SHALL show an AI icon with "Approved" status

### Requirement: Linear undo
Users SHALL be able to undo the most recent applied patches in reverse order. An "Undo" button SHALL appear on the most recent entry. Undoing a patch SHALL revert its changes and move it to an "undone" state.

#### Scenario: Undo most recent patch
- **WHEN** user clicks "Undo" on the most recent history entry
- **THEN** the patch SHALL be reverted
- **AND** the entry SHALL show "Undone" status
- **AND** the "Undo" button SHALL move to the next most recent entry

#### Scenario: Undo is linear only
- **WHEN** user attempts to undo a patch that is not the most recent
- **THEN** the undo action SHALL NOT be available on that entry

### Requirement: Patch detail expansion
Clicking a history entry SHALL expand it to show the full patch details: per-operation before/after values and affected entity counts.

#### Scenario: Expand patch details
- **WHEN** user clicks a "Rename token" history entry
- **THEN** the entry SHALL expand showing the old name -> new name and the count of affected usages

### Requirement: Version tracking
Each history entry SHALL display the version transition (e.g., "v14 -> v15") to track the IR version progression.

#### Scenario: Version numbers display
- **WHEN** a patch transitions the IR from version 14 to 15
- **THEN** the history entry SHALL show "v14 -> v15"
