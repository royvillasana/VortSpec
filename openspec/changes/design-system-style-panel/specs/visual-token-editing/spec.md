## ADDED Requirements

### Requirement: The Playground sidebar is a resizable layer tree above a tabbed detail region
Below the sidebar's existing **Pages** region, the Playground's sidebar SHALL be organized as a **layer
tree** region, with its own scroll, above a **tabbed detail region** carrying **Design Attributes** and
**Library** tabs. The Pages region SHALL remain at the top, unchanged. The boundary between the two
SHALL be resizable, so the user can trade tree height against detail height, and the chosen height SHALL
persist per project.

#### Scenario: Selecting a layer fills the detail region below it
- **WHEN** the user selects a layer in the tree with the Design Attributes tab active
- **THEN** that layer's properties are shown in the tab below the tree, and the tree stays in place

#### Scenario: The boundary is resizable
- **WHEN** the user drags the boundary between the tree and the detail region
- **THEN** the tree's height changes against the detail region's, and the new height is still in effect when the project is reopened

#### Scenario: Pages stays above the tree
- **WHEN** the user opens the Playground sidebar
- **THEN** the Pages region is at the top, with the layer tree and the tabbed detail region beneath it

#### Scenario: The tree stays a stable navigator
- **WHEN** the user switches between the Design Attributes and Library tabs
- **THEN** the layer tree and its scroll position are unaffected

### Requirement: The layer tree can be searched by name
The layer tree SHALL offer a search that filters it to nodes whose name matches what the user types, so a
node can be reached directly instead of by scrolling and expanding a long tree. Matching SHALL be
case-insensitive, and a match's place in the hierarchy SHALL stay readable.

#### Scenario: Finding a layer by typing its name
- **WHEN** the user types "footer" into the tree's search on a screen with many nodes
- **THEN** the tree narrows to the matching node so it can be selected directly

#### Scenario: Clearing the search restores the tree
- **WHEN** the user clears the search
- **THEN** the full tree returns with the current selection still selected

## MODIFIED Requirements

### Requirement: Design panel presents the selection in Figma-style sections

When an element is selected, the Design panel SHALL present its editable values organized into the following sections, in this order, mirroring Figma's Design tab:

1. **Current variant** — variant switchers for the selected component (see the variant-switching requirement); omitted when the selection is not a variant-bearing component.
2. **Position** — alignment, X/Y offset, constraints, and rotation (mapped from layout position and CSS `transform`).
3. **Layout** — outer / auto layout: flow direction (`flex-direction`), resizing of width/height (fixed vs. hug=`fit-content`/`auto` vs. fill=`flex:1`), alignment (justify/align), gap, and padding.
4. **Appearance** — opacity, corner radius, blend mode, and visibility.
5. **Stroke** — border width, color, and style.
6. **Fill** — background color / background.
7. **Effects** — box-shadow and filter effects (blur, drop-shadow).
8. **Colors** — the color tokens/values in effect for the selection.
9. **Layout guide** — layout grid / guide settings for the selection when present.

These sections SHALL be presented in the **Design Attributes** tab of the sidebar's detail region — beneath the layer tree rather than as a second list beside it — headed by the selected node's name and its dimensions. Their content and controls are unchanged by this placement.

Each section SHALL be collapsible. Each value SHALL show its current setting and, when backed by a design token, the owning **token name** (traced through `var()` chains); non-token values SHALL be shown as literals with a clear token-vs-literal indicator. A section with no applicable values for the selection SHALL be hidden or shown empty (not error).

#### Scenario: Sections render in Figma order for a selection

- **WHEN** the user selects an element
- **THEN** the Design panel SHALL show the Position, Layout, Appearance, Stroke, Fill, Effects, Colors, and Layout-guide sections populated from the element's computed style, each with current values

#### Scenario: The selection's identity and size head the tab

- **WHEN** an element is selected
- **THEN** the Design Attributes tab is headed by that element's name and its dimensions

#### Scenario: Token-backed values name their token

- **WHEN** a value in any section resolves from a design token
- **THEN** that value SHALL display the owning token name and be marked token-backed, versus literal values shown as plain numbers/colors

#### Scenario: Inapplicable sections do not error

- **WHEN** a section has no applicable values for the selection (e.g. no stroke)
- **THEN** that section SHALL be hidden or shown as empty, never raising an error
