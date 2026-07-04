# Capability: Import Flow

## Purpose

Design asset import pipeline supporting ZIP upload, Figma connection, companion design system attachment, and multi-stage progress tracking.

## Requirements

### Requirement: New Import page layout
The New Import page SHALL render as a centered column with `max-width: 640px`. The page title SHALL be "Import a design" in `text-[20px] font-semibold`. The two source cards SHALL be in a side-by-side grid (`grid-cols-2 gap-4`), each with `bg-vs-bg-surface`, `border-vs-border-default`, `rounded-lg`, and `24px` padding.

#### Scenario: Layout renders correctly
- **WHEN** user navigates to `/projects/[id]/import`
- **THEN** the page SHALL display a centered 640px column with title, two source cards side by side, optional DS section, and "Start import" button

### Requirement: ZIP upload via drag-and-drop
The New Import screen SHALL provide a dashed dropzone (120px tall, `border-vs-border-default` dashed, `rounded-lg`) inside the "Upload a ZIP export" card. The card SHALL have a title "Upload a ZIP export" and subtitle "Google Stitch, Claude Design, or any HTML/CSS export". The dropzone SHALL display "Drop your .zip here or click to browse. Up to 50 MB." and accept ZIP files up to 50 MB via drag-and-drop or click-to-browse.

#### Scenario: User uploads a valid ZIP
- **WHEN** user drags a ZIP file onto the dropzone
- **THEN** the dropzone border SHALL change to accent color `#7C6FF0` (solid, not dashed)
- **AND** on drop, the file SHALL be accepted and the dropzone SHALL be replaced with a filename chip showing name, size, and a remove "x" button

#### Scenario: Invalid file rejected
- **WHEN** user drops a non-ZIP file or a file exceeding 50 MB
- **THEN** an error message SHALL appear below the dropzone: "We could not find HTML or CSS inside this file" in `#E5484D`
- **AND** the dropzone SHALL remain visible for retry

#### Scenario: Dropzone hover state
- **WHEN** user drags a file over the dropzone (before dropping)
- **THEN** the dropzone border SHALL change to accent color `#7C6FF0`
- **AND** the background SHALL subtly tint toward the accent color

#### Scenario: File attached state
- **WHEN** a valid ZIP file has been attached
- **THEN** the dropzone SHALL be replaced with a chip showing the filename and file size
- **AND** the chip SHALL include a remove "x" button that clears the attached file and restores the dropzone

#### Scenario: Remove attached file
- **WHEN** user clicks the remove "x" button on the filename chip
- **THEN** the file SHALL be cleared
- **AND** the dropzone SHALL reappear in its default state
- **AND** the "Start import" button SHALL become disabled

### Requirement: Figma connection option
The import screen SHALL provide a "Connect Figma" card alongside the ZIP card. The card SHALL have a title "Connect Figma" and subtitle "Import published components and variables from a Figma file". It SHALL contain a secondary-style "Connect Figma" button (`bg-vs-bg-elevated` with `border-vs-border-strong`) and muted helper text: "Optional. You can always start with a ZIP and connect Figma later."

#### Scenario: User clicks Connect Figma
- **WHEN** user clicks the "Connect Figma" button
- **THEN** the Figma OAuth flow SHALL be initiated (stubbed in Phase 1)

### Requirement: Companion design system attachment
The import screen SHALL show a collapsible section below the source cards titled "Attach a design system (optional)" with a rotating chevron toggle. When expanded, it SHALL display a smaller dropzone accepting "tokens.json, CSS variables file, or a second ZIP" and helper text "We will match extracted values against your official tokens and flag conflicts."

#### Scenario: Expand design system section
- **WHEN** user clicks the "Attach a design system (optional)" header
- **THEN** the section SHALL expand revealing the dropzone
- **AND** the chevron SHALL rotate 90 degrees

#### Scenario: User attaches companion DS
- **WHEN** user attaches a tokens.json file in the expanded section
- **THEN** the file SHALL appear as a chip with remove button
- **AND** the pipeline SHALL use it as the official token source for matching in DS merge stage

### Requirement: Start import button state
The "Start import" primary button SHALL appear at the bottom right of the form. It SHALL be disabled (`bg-vs-bg-elevated`, `border-vs-border-default`, `text-vs-text-muted`, `cursor-not-allowed`) when no source file is attached, and enabled (`bg-vs-accent`, `text-white`) when a ZIP file is attached or Figma is connected.

#### Scenario: Button disabled without source
- **WHEN** no ZIP file is attached and Figma is not connected
- **THEN** the "Start import" button SHALL be visually disabled and non-clickable

#### Scenario: Button enabled with source
- **WHEN** a valid ZIP file is attached
- **THEN** the "Start import" button SHALL become enabled
- **AND** clicking it SHALL navigate to the import progress screen

### Requirement: Import progress tracking
The Import Progress screen SHALL display the six pipeline stages (Parse, Style Mining, Token Inference, Structure Inference, DS Merge, Report) with per-stage status indicators: queued (gray), running (animated blue), done (green check), failed (red with error message).

#### Scenario: Pipeline stages progress
- **WHEN** an import job is running
- **THEN** the progress screen SHALL show each stage with its current status
- **AND** the active stage SHALL display a running animation

#### Scenario: Stage failure with retry
- **WHEN** a pipeline stage fails
- **THEN** that stage SHALL display a red error indicator with a human-readable reason
- **AND** a "Retry" button SHALL allow re-running the failed stage without re-running completed stages

### Requirement: Navigation to inspector on completion
When all pipeline stages complete successfully, the progress screen SHALL provide a button to navigate to the Design Inspector.

#### Scenario: Import completes successfully
- **WHEN** all six pipeline stages reach "done" status
- **THEN** a "View in Inspector" button SHALL appear
- **AND** clicking it SHALL navigate to `/projects/[id]/inspect/tokens`
