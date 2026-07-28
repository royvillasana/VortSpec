## ADDED Requirements

### Requirement: Light pages render in the framework RunCanvas

A light page (`.vortspec/light-pages/<name>.html`) SHALL render inside the SAME framework
RunCanvas used for framework screens — the Electron `<webview>` instrumented by the guest
inspector-bridge — not in a separate editor component. The page SHALL be served from a local
`http` origin so the guest preload and bridge instrument it exactly as they do a dev-server page.

#### Scenario: Selecting a light page opens it in the framework canvas
- **WHEN** the user selects a `light://<name>` page in the Playground site tree
- **THEN** the light page HTML loads in the framework canvas webview with the guest preload
- **AND** no separate light-page editor (iframe or right-side panel) is shown

#### Scenario: The left DesignPanel and layers reflect the light page
- **WHEN** a light page is open in the canvas and the user clicks an element on it
- **THEN** the left-sidebar DesignPanel shows that element's properties and the layers tree
  reflects the light page's DOM — driven by the inspector-bridge, identical to a framework screen

### Requirement: The full existing control set works on a light page

The system MUST operate the existing canvas controls (select, hover, the DesignPanel property
editors, drag, move, insert, and layers) on a light page unchanged. The system MUST NOT
introduce any new or duplicate editing controls for light pages.

#### Scenario: Drag/move and insert use the same handlers
- **WHEN** the user drags an element or inserts a component on a light page
- **THEN** the same canvas gestures/handlers used for framework screens apply the change
- **AND** the result is reflected live in the canvas via the inspector-bridge

#### Scenario: No separate light editor remains
- **WHEN** the light-pages-on-canvas change is applied
- **THEN** the standalone `LightPageCanvas`, its right-side editing panel, and the on-canvas
  "Convert to code" button are removed
