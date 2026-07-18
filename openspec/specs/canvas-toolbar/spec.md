# canvas-toolbar Specification

## Purpose
TBD - created by archiving change canvas-compose-and-preview-bar. Update Purpose after archive.
## Requirements
### Requirement: A single floating toolbar owns the canvas controls

The canvas SHALL present its input-mode and viewport controls in **one** floating toolbar pinned bottom-center over the canvas viewport, rendered by a single shared component. The toolbar SHALL carry the input modes (**Inspect**, **Interact**, **Comment**, **Insert**), the zoom controls, and a bridge-status indicator. No other surface SHALL render a second copy of these controls; the mode toggle currently duplicated in the Design panel's Layers header and in the Comments panel SHALL be removed in favour of this one.

#### Scenario: The toolbar renders over the canvas

- **WHEN** the canvas is showing a running dev server
- **THEN** a floating toolbar SHALL be pinned bottom-center over the canvas viewport carrying the Inspect, Interact, Comment, and Insert modes, the zoom controls, and the bridge-status indicator

#### Scenario: Controls are not duplicated

- **WHEN** any canvas mode is active, including Comment mode where the Comments panel replaces the Design panel
- **THEN** the mode and zoom controls SHALL be rendered only by the floating toolbar
- **AND** neither the Design panel nor the Comments panel SHALL render its own mode toggle

#### Scenario: Controls survive a collapsed Layers region

- **WHEN** the user collapses the Design panel's Layers region
- **THEN** the mode and zoom controls SHALL remain fully available on the toolbar

### Requirement: Modes are mutually exclusive and Interact is the resting state

Exactly one input mode SHALL be active at a time. **Interact** SHALL be the resting mode in which the canvas passes all input to the running app untouched, and SHALL be the default when the canvas opens. Selecting Inspect, Comment, or Insert SHALL deactivate whichever mode was previously active. Overlay affordances belonging to a mode SHALL be shown only while that mode is active.

#### Scenario: Interact is the default

- **WHEN** the canvas first attaches to a running dev server
- **THEN** the active mode SHALL be Interact
- **AND** hover highlights, selection boxes, and insertion lines SHALL NOT be drawn

#### Scenario: Switching modes deactivates the previous one

- **WHEN** Inspect is active and the user activates Insert
- **THEN** Insert SHALL become the only active mode
- **AND** Inspect's hover highlight and selection affordances SHALL be withdrawn from the canvas

#### Scenario: Interact leaves the app untouched

- **WHEN** Interact is active and the user clicks a control inside the running app
- **THEN** the click SHALL reach the app
- **AND** VortSpec SHALL NOT select, highlight, or intercept the element

### Requirement: The toolbar reports bridge liveness

The toolbar SHALL show whether the inspector bridge is attached to the guest page, so the user can tell "the app is not responding" apart from "visual editing is unavailable." It SHALL distinguish three states: **live** (attached), **connecting** (not yet attached, no failure), and **failed** (the bridge reported it could not attach).

Only the **failed** state SHALL disable the modes that depend on the bridge (Inspect, Comment, Insert), with a human explanation naming the cause and a next step. Interact SHALL remain available in every state so the app stays usable. **Connecting SHALL disable nothing:** the bridge resets to not-ready on every guest page load, so a live reload — the routine result of the agent editing files — passes through connecting constantly, and disabling on it would take the modes away mid-session and swallow the clicks that land in that window.

The explanation shown for the failed state SHALL be the same sentence the canvas renders in its "visual editing unavailable" notice, from a single source, so the two cannot drift.

#### Scenario: Bridge attached

- **WHEN** the guest page has loaded and the bridge has attached
- **THEN** the toolbar SHALL indicate the live state and all modes SHALL be enabled

#### Scenario: Bridge still connecting

- **WHEN** the guest page is loading or reloading and the bridge has not yet attached, and no failure has been reported
- **THEN** the toolbar SHALL indicate the connecting state
- **AND** every mode SHALL remain enabled

#### Scenario: Bridge failed to attach

- **WHEN** the bridge reports that it could not attach to the guest page
- **THEN** the toolbar SHALL indicate the unavailable state with a human sentence and a next step
- **AND** Inspect, Comment, and Insert SHALL be disabled while Interact SHALL remain available
- **AND** the canvas SHALL continue to show the interactive app

### Requirement: The documented modes match the implemented modes

The canvas SHALL document exactly the input modes it implements. A mode SHALL NOT be named in code documentation, labels, or help text unless it exists and is reachable.

#### Scenario: No phantom modes

- **WHEN** the canvas source or UI names its available modes
- **THEN** it SHALL name Inspect, Interact, Comment, and Insert
- **AND** it SHALL NOT reference a "Pan" mode, which is not implemented

