## REMOVED Requirements

### Requirement: Graph canvas with dot grid background
**Reason**: The React Flow token/component graph is out of scope for v2 (PRD §13 — returns only post-D4 if usage asks).
**Migration**: None in v2.

### Requirement: Lens switcher
**Reason**: Graph view out of scope for v2.
**Migration**: None in v2.

### Requirement: Component lens - component selector
**Reason**: Graph view out of scope for v2.
**Migration**: None in v2.

### Requirement: Component lens - token nodes
**Reason**: Graph view out of scope for v2.
**Migration**: None in v2.

### Requirement: Component lens - component node
**Reason**: Graph view out of scope for v2.
**Migration**: None in v2.

### Requirement: Component lens - edges
**Reason**: Graph view out of scope for v2.
**Migration**: None in v2.

### Requirement: Edge rewiring via drag
**Reason**: IR-mutating graph editing removed.
**Migration**: None in v2.

### Requirement: Disconnect edge to flagged literal
**Reason**: IR flagging model retired.
**Migration**: None in v2.

### Requirement: Token lens - central token node
**Reason**: Graph view out of scope for v2.
**Migration**: None in v2.

### Requirement: Token lens - component thumbnails
**Reason**: Graph view out of scope for v2.
**Migration**: None in v2.

### Requirement: Token lens - live value editing
**Reason**: IR-mutating editing removed.
**Migration**: None in v2.

### Requirement: Zoom controls
**Reason**: Graph view out of scope for v2.
**Migration**: None in v2.

### Requirement: Toast notifications
**Reason**: Re-homed to the Electron renderer's own notification patterns.
**Migration**: Renderer provides its own toasts (v1 `vsToastIn` animation preserved in the extracted stylesheet).
