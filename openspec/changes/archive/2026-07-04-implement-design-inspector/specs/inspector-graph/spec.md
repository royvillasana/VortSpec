## ADDED Requirements

### Requirement: Graph canvas with dot grid background
The Graph view SHALL render on a canvas with a dot-grid background (radial-gradient `#1B1D21` 1px dots on `#0B0C0E`, 24px spacing) and support pan and zoom interactions.

#### Scenario: Canvas renders with dot grid
- **WHEN** user navigates to the Graph view
- **THEN** the canvas SHALL display with a dot-grid background pattern

### Requirement: Lens switcher
The Graph view SHALL provide a lens switcher (segmented control) at the top-left for toggling between "Component" lens and "Token" lens. The active lens SHALL have background `#1B1D21` and color `#E7E9EC`.

#### Scenario: Switch between lenses
- **WHEN** user clicks "Token" in the lens switcher
- **THEN** the view SHALL switch to the Token lens
- **AND** the "Token" button SHALL show active styling

### Requirement: Component lens - component selector
In Component lens, a select dropdown SHALL allow choosing which component to inspect. The dropdown SHALL list all components in the project.

#### Scenario: Select component to inspect
- **WHEN** user selects "Input" from the component dropdown
- **THEN** the graph SHALL render the Input component's token wiring

### Requirement: Component lens - token nodes
In Component lens, token nodes SHALL render on the left side of the canvas. Each node SHALL display: a type-specific icon (color swatch, "Ag" glyph, spacing bar, radius corner), token name in Geist Mono 11px, resolved value in Geist Mono 11px `#9BA1AB`, provenance dot (green/amber), and an output socket (10x10px circle with `#0B0C0E` fill and colored border).

#### Scenario: Token nodes render with correct icons
- **WHEN** the graph displays in Component lens
- **THEN** color tokens SHALL show a colored swatch, typography tokens SHALL show "Ag", spacing tokens SHALL show a horizontal bar, and radius tokens SHALL show a corner shape

### Requirement: Component lens - component node
In Component lens, a single component node SHALL render on the right side. It SHALL contain: a variant selector (segmented control), a live preview area rendering the component from IR, the component name, completeness score, and an "Open" link to the component detail. Input handles SHALL appear on the left edge, grouped by bound property (background, text color, radius, typography, gap).

#### Scenario: Component node renders with preview
- **WHEN** the graph displays Button in Component lens
- **THEN** the component node SHALL show a variant selector, live Button preview, "Button" name, completeness score, and "Open" link

### Requirement: Component lens - edges
Bezier curve edges SHALL connect token output sockets to component input handles. Edges SHALL be colored by token type. The bezier curve SHALL use cubic control points with `dx = max(50, (x2-x1)/2)`.

#### Scenario: Edges connect tokens to component
- **WHEN** the graph renders in Component lens
- **THEN** bezier edges SHALL connect each token's output socket to the corresponding component input handle

### Requirement: Edge rewiring via drag
Users SHALL rewire edges by dragging a component input handle to a different token node. During drag: a dashed purple (`#7C6FF0`) edge SHALL follow the cursor, compatible target tokens SHALL glow (border `#7C6FF0`, box-shadow), and incompatible tokens SHALL dim (opacity 0.4).

#### Scenario: Drag to rewire background token
- **WHEN** user drags the "background" handle away from `color/primary/500`
- **THEN** a dashed purple edge SHALL follow the cursor
- **AND** only color tokens SHALL glow as valid drop targets
- **AND** radius/typography/spacing tokens SHALL dim

#### Scenario: Drop on compatible token completes rewire
- **WHEN** user drops the dragged handle onto `color/primary/600`
- **THEN** the binding SHALL update via `component.updateNode` IRPatch
- **AND** the preview SHALL re-render with the new token value
- **AND** a toast SHALL confirm "Rewire Button background to color/primary/600 - Patch applied"

#### Scenario: Drop on incompatible token rejected
- **WHEN** user drops a color handle onto a radius token
- **THEN** the connection SHALL be rejected with a shake animation
- **AND** a tooltip SHALL display "radius/md is not a color"

### Requirement: Disconnect edge to flagged literal
Deleting an edge SHALL convert the binding into a flagged literal. The literal SHALL render as an amber chip attached to the handle showing the last resolved value and a "Promote to token" action.

#### Scenario: Delete edge creates flagged literal
- **WHEN** user disconnects the text-color edge
- **THEN** the handle SHALL show an amber chip displaying "#FFFFFF flagged"
- **AND** a flagged-literal issue SHALL be created

#### Scenario: Promote flagged literal from graph
- **WHEN** user hovers the flagged literal chip and clicks "Promote to token"
- **THEN** a new token SHALL be created with the literal value
- **AND** the chip SHALL change to a green confirmed badge showing the new token name
- **AND** a toast SHALL confirm the promotion

### Requirement: Token lens - central token node
In Token lens, the selected token SHALL render as a central node on the left with: type swatch, token name in Geist Mono 11px, resolved value, usage count, provenance dot, output socket, and a glow ring (box-shadow `0 0 0 3px rgba(124,111,240,0.15)`).

#### Scenario: Token lens renders central token
- **WHEN** user switches to Token lens for `color/neutral/500`
- **THEN** the central node SHALL display the token with swatch, name, value `#6B7280`, "22 uses", and a purple glow ring

### Requirement: Token lens - component thumbnails
In Token lens, edges SHALL fan out from the central token to component thumbnail nodes on the right. Each thumbnail SHALL show: a mini preview of the component, the component name, the property being bound, and the completeness score with color coding.

#### Scenario: Token lens shows consuming components
- **WHEN** `color/neutral/500` is viewed in Token lens
- **THEN** thumbnail nodes SHALL appear for Button, Card, Input, Badge showing which property consumes the token

### Requirement: Token lens - live value editing
A detail panel on the right SHALL allow editing the token value (color picker + hex input). Editing SHALL ripple to all connected component thumbnails with a brief edge highlight animation, and SHALL follow patch semantics.

#### Scenario: Edit token value ripples to thumbnails
- **WHEN** user changes `color/neutral/500` value from `#6B7280` to `#8B8FA0` in the detail panel
- **THEN** all connected thumbnail previews SHALL update with the new color
- **AND** edges SHALL briefly highlight with purple (`#7C6FF0`)
- **AND** a toast SHALL confirm the edit with version bump

### Requirement: Zoom controls
The canvas SHALL provide zoom controls at the bottom-right: zoom in (+), zoom out (-), current zoom percentage in Geist Mono, and a "Fit view" button. Zoom range SHALL be 50% to 150%.

#### Scenario: Zoom in and out
- **WHEN** user clicks the "+" button
- **THEN** the canvas scale SHALL increase by 10% (up to 150%)
- **AND** the percentage label SHALL update

#### Scenario: Fit view resets zoom
- **WHEN** user clicks "Fit view"
- **THEN** the canvas SHALL zoom to 85% to fit all content

### Requirement: Toast notifications
Patch operations on the graph (rewire, promote, edit) SHALL show a toast notification at the bottom center with a green check, operation description, and version bump in Geist Mono. Toasts SHALL auto-dismiss after 3 seconds with a slide-up entrance animation.

#### Scenario: Toast on rewire
- **WHEN** user rewires Button background to `color/primary/600`
- **THEN** a toast SHALL appear: "Rewire Button background to color/primary/600 - Patch applied, v14 -> v15"
- **AND** the toast SHALL dismiss after 3 seconds
