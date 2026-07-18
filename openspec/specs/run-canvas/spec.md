# run-canvas Specification

## Purpose
The Run activity's hybrid browser + design canvas: the live dev-server app embedded in an instrumented webview inside a pan/zoom surface, a hover/select overlay with resize and spacing handles, and the Figma-style Design panel (Layers node tree + selection property sections) that replaces the file Explorer while the activity is active.

## Requirements

### Requirement: Run activity hosts a hybrid browser + design canvas

In the Run activity (app kind), the live dev-server app SHALL render inside a pan/zoom **Run Canvas** surface instead of a plain iframe. The app SHALL remain fully interactive (clicks, scrolling, navigation) while an overlay layer draws selection and hover affordances on top. The canvas SHALL degrade gracefully: when the dev server is not running, it SHALL show the existing start/loading states; it SHALL NOT block on the inspector bridge failing to attach.

#### Scenario: Live app renders in the canvas

- **WHEN** the app dev server is running and the user opens the Run activity
- **THEN** the running app SHALL be embedded in the Run Canvas and be interactive (the user can click and scroll within it)

#### Scenario: Pan and zoom the canvas

- **WHEN** the user zooms (pinch/⌘-scroll or the zoom control) or pans the canvas
- **THEN** the embedded app and its selection overlay SHALL scale/translate together so overlay handles stay aligned to the rendered elements
- **AND** a control SHALL reset the canvas to 100% / fit

#### Scenario: Bridge failure does not break the preview

- **WHEN** the inspector bridge cannot attach to the guest page
- **THEN** the app SHALL still render and remain usable, and the canvas SHALL surface a non-blocking notice that visual editing is unavailable

### Requirement: Figma-style Design panel replaces the file Explorer in the Run activity

When the Run activity is active, the left sidebar SHALL present a **Figma-style Design panel** rather than the file Explorer. The panel SHALL have two stacked regions: a collapsible **Layers** region at the top — a component / DOM **node tree** of the currently rendered page — and, below it, the **selection property sections** (defined in the `visual-token-editing` capability). Node-tree nodes SHALL be lazily expandable and each SHALL show its element identity (tag, id, key classes, `role`, and `data-component` when present). Selecting a node SHALL select the corresponding element on the canvas, and vice versa. Leaving the Run activity SHALL restore the file Explorer unchanged.

#### Scenario: Layers tree reflects the rendered page

- **WHEN** the Run activity is active and the app has rendered
- **THEN** the Design panel's Layers region SHALL show a tree of the page's components/elements that the user can expand and collapse

#### Scenario: Tree ↔ canvas cross-selection

- **WHEN** the user selects a node in the Layers tree
- **THEN** the matching element on the canvas SHALL be highlighted and scrolled into view
- **AND WHEN** the user selects an element on the canvas, its node in the tree SHALL be revealed and highlighted

#### Scenario: Selection populates the property sections

- **WHEN** an element is selected
- **THEN** the Design panel SHALL show the selection's property sections below the Layers tree

#### Scenario: Switching away restores the file Explorer

- **WHEN** the user leaves the Run activity for a file-based activity
- **THEN** the left sidebar SHALL return to the file Explorer unchanged

### Requirement: Element selection shows manipulation handles

Selecting a rendered element SHALL draw a bounding highlight with **resize handles** (corners/edges for size) and **spacing handles** (padding/margin edges), positioned in canvas coordinates. Hovering an element (without selecting) SHALL show a lighter highlight with its tag/size label.

#### Scenario: Handles appear on selection

- **WHEN** the user selects an element on the canvas
- **THEN** a bounding box with resize and spacing handles SHALL be drawn around it, tracking the element's on-screen rectangle

#### Scenario: Hover affordance

- **WHEN** the user hovers an element without selecting it
- **THEN** a lightweight highlight and a label (tag + dimensions) SHALL appear, and SHALL clear when the pointer leaves
