## ADDED Requirements

### Requirement: Guest-page instrumentation via an Electron webview bridge

The live app SHALL be embedded in an Electron `<webview>` whose **guest preload** injects an inspector bridge into the rendered page. The bridge SHALL operate without requiring any code change, dependency, or cooperation from the user's dev server or app (it reads the already-rendered DOM). The IDE window SHALL enable `webviewTag`, and the guest preload SHALL be a dedicated, isolated build artifact.

#### Scenario: Bridge attaches to any localhost app

- **WHEN** the webview finishes loading the resolved dev-server URL
- **THEN** the guest preload SHALL attach the inspector bridge and begin serving the node tree and element geometry to the host renderer, with no modification to the user's project required

#### Scenario: Bridge is scoped to the resolved dev URL

- **WHEN** the canvas embeds the app
- **THEN** the webview SHALL load only the dev-server URL already resolved by the dev-server manager (no arbitrary navigation initiated by VortSpec)

### Requirement: Bridge streams the node tree, computed styles, and geometry

The bridge SHALL provide, on request and on relevant DOM/layout changes: a **node tree** (element identity per node), the **bounding rectangle** of any node in guest viewport coordinates, and the **computed style + resolved box-model** (padding, margin, border-radius, width/height, color, font) for a selected node. Geometry updates SHALL be delivered so the host overlay can stay aligned during scroll/resize.

#### Scenario: Node tree on demand

- **WHEN** the host requests the current node tree
- **THEN** the bridge SHALL return the tree with each node's tag, id, classes, `role`, and `data-component` when present, plus a stable per-render node handle

#### Scenario: Selected-element details

- **WHEN** the host selects a node
- **THEN** the bridge SHALL return that node's bounding rectangle and its computed box-model and style values

#### Scenario: Geometry stays aligned

- **WHEN** the guest page scrolls, resizes, or its layout changes
- **THEN** the bridge SHALL emit updated geometry for the selected/hovered node so the overlay handles remain aligned

### Requirement: Element ↔ component ↔ token mapping

The bridge, together with the host, SHALL map a selected rendered element to (a) its owning **source component** when derivable (e.g. via `data-component`, class or filename heuristics reusing `component-reader`), and (b) the set of **design tokens** that resolve into its computed style, by tracing CSS custom properties / `var()` chains against the project's parsed tokens.

#### Scenario: Resolve the tokens behind an element

- **WHEN** an element is selected
- **THEN** the system SHALL list the design tokens whose values resolve into that element's padding, margin, border-radius, size, color, and typography, tracing `var()` references to the owning token names

#### Scenario: Resolve the source component

- **WHEN** an element maps to a known project component
- **THEN** the system SHALL identify that component (and its Figma match when reconciled), enabling cross-highlight in the node tree

### Requirement: Ephemeral live style overrides

The bridge SHALL apply **ephemeral CSS overrides** to the guest page for instant visual feedback during direct manipulation, without writing any file. Overrides SHALL be reversible in-session and SHALL be cleared when the user cancels, when the selection changes without applying, or when the page reloads.

#### Scenario: Instant feedback while dragging

- **WHEN** the user drags a resize or spacing handle, or edits a value field
- **THEN** the bridge SHALL apply the change to the guest page immediately as an in-memory override, with no file written

#### Scenario: Cancel reverts the override

- **WHEN** the user cancels an in-progress edit (or changes selection without applying)
- **THEN** the ephemeral override SHALL be removed and the rendered element SHALL return to its committed appearance
