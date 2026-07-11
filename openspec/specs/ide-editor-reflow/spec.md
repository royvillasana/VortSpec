# ide-editor-reflow Specification

## Purpose
TBD - created by archiving change ide-vscode-workbench. Update Purpose after archive.
## Requirements
### Requirement: Deterministic editor reflow on resize
The code editor SHALL soft-wrap long lines to the editor's current width and SHALL re-compute that wrap on every change to the editor container's size — sidebar drag, panel toggle/dock move, editor open/close, and window resize — in both directions (grow and shrink). Wrapped text SHALL never remain stale, get cut off, or visually overlap an adjacent region after a resize.

#### Scenario: Wrap tracks the editor width when shrinking
- **WHEN** the user drags the assistant sidebar wider so the editor gets narrower
- **THEN** the editor re-wraps its lines to the new narrower width with no line cut off

#### Scenario: Wrap tracks the editor width when growing (both directions)
- **WHEN** the user then drags the assistant sidebar back narrower so the editor gets wider
- **THEN** the editor re-wraps (unwraps) to the new wider width, and repeating the resize back and forth keeps the wrap correct every time — not only on the first change

#### Scenario: No overlap after resize
- **WHEN** any adjacent region (sidebar, panel) is resized so the editor's width changes
- **THEN** the editor's rendered content resizes with its container and never overlaps or is overlapped by the neighboring region

### Requirement: Diff view reflow
The git diff view SHALL follow the same reflow behavior as the editor — wrapping to its current width and re-computing on container resize.

#### Scenario: Diff re-wraps on resize
- **WHEN** the diff view is open and a neighboring region is resized
- **THEN** the diff panes re-wrap to their new width

