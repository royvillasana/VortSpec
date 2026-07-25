## MODIFIED Requirements

### Requirement: Element selection shows manipulation handles

Selecting a rendered element SHALL draw a bounding highlight with **resize handles** (corners/edges for size) and **spacing handles** (padding/margin edges), positioned in canvas coordinates. Hovering an element (without selecting) SHALL show a lighter highlight with its tag/size label. Dragging a handle or the element itself SHALL apply the change to the live preview **optimistically and immediately**, and persist it to source **deterministically in the background** — with no Apply, Keep, or Save step (see the `instant-canvas-edits` capability). The manipulation handles are direct-manipulation inputs and therefore never trigger an AI run.

#### Scenario: Handles appear on selection

- **WHEN** the user selects an element on the canvas
- **THEN** a bounding box with resize and spacing handles SHALL be drawn around it, tracking the element's on-screen rectangle

#### Scenario: Hover affordance

- **WHEN** the user hovers an element without selecting it
- **THEN** a lightweight highlight and a label (tag + dimensions) SHALL appear, and SHALL clear when the pointer leaves

#### Scenario: Dragging a handle applies and persists without a gate

- **WHEN** the user drags a resize or spacing handle on a resolvable element
- **THEN** the preview updates immediately and the change is written to source deterministically in the background, with no Apply/Keep/Save step and no AI run
