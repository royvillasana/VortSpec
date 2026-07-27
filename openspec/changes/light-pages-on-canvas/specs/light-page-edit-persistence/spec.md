## ADDED Requirements

### Requirement: Canvas edits on a light page persist as HTML/CSS/JS

When the page being edited in the canvas is a light page, a canvas edit SHALL be persisted by
serializing the live DOM to the page's `.vortspec/light-pages/<name>.html` file — NOT through
the ts-morph React codemod. The persisted output SHALL remain framework-free HTML/CSS/JS.

#### Scenario: An edit writes HTML, not React
- **WHEN** the user changes text, style, or structure on a light page in the canvas
- **THEN** the change is written to `<name>.html` as HTML/CSS/JS by serializing the DOM
- **AND** `main/canvas/write.ts`'s ts-morph path is NOT used for that edit

#### Scenario: The DOM is the source — no source mapping needed
- **WHEN** a light-page edit is persisted
- **THEN** it does not require a Vite dev-stamp or AST anchor mapping, because the DOM is the source
- **AND** the whole-DOM serialization is lossless (round-trips without altering unedited markup)

### Requirement: Persistence is routed by page kind

The canvas-edit dispatch SHALL route persistence by page kind: framework pages keep the existing
`applyCanvasEdit` (ts-morph) path; light pages use the DOM-serialize path. The framework path
SHALL be unchanged.

#### Scenario: Framework pages are unaffected
- **WHEN** the user edits a framework (React) screen in the canvas
- **THEN** the edit persists via the existing ts-morph `applyCanvasEdit` path exactly as before

#### Scenario: A structural move cannot nest one component inside another
- **WHEN** the user drags a component on a light page to reorder it
- **THEN** the DOM-serialize persistence writes exactly the resulting DOM
- **AND** it cannot produce the ts-morph move-nesting corruption (a component inside another's body)
