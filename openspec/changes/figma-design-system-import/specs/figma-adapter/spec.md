## ADDED Requirements

### Requirement: Parse Figma URL
The adapter SHALL accept a Figma file URL in the format `https://figma.com/design/:fileKey/:fileName` and extract the `fileKey`. Both `/design/` and `/file/` URL formats SHALL be supported.

#### Scenario: Valid Figma URL parsed
- **WHEN** user provides `https://figma.com/design/ABC123/My-Design`
- **THEN** the adapter SHALL extract fileKey `ABC123`

#### Scenario: Invalid URL rejected
- **WHEN** user provides a non-Figma URL
- **THEN** the adapter SHALL return a clear error message

### Requirement: Figma REST API client with PAT auth
The adapter SHALL call the Figma REST API using a Personal Access Token provided by the user. All requests SHALL include the `X-Figma-Token` header. The client SHALL handle rate limiting with batching and retry on 429.

#### Scenario: Authenticated API call
- **WHEN** the adapter calls `GET /v1/files/:key`
- **THEN** the request SHALL include `X-Figma-Token: <PAT>` header

#### Scenario: Rate limit hit
- **WHEN** the API returns 429 Too Many Requests
- **THEN** the client SHALL wait and retry with exponential backoff

### Requirement: Extract variables as confirmed tokens
The adapter SHALL call `GET /v1/files/:key/variables/local` to read Figma variables. Each variable SHALL become a DesignToken with `confidence: 'confirmed'` and `source: 'figma'`.

#### Scenario: Color variable becomes confirmed token
- **WHEN** a Figma file has a color variable `primary/500 = #2563EB`
- **THEN** a DesignToken SHALL be created with `name: "primary/500"`, `type: "color"`, `confidence: "confirmed"`

### Requirement: Extract component sets as ComponentIR with variants
The adapter SHALL call `GET /v1/files/:key/components` and fetch node details. Component sets SHALL become ComponentIR with variant axes from Figma's variant properties, `confidence: 'confirmed'`.

#### Scenario: Component set with variants
- **WHEN** a Figma component set "Button" has variant properties `Style=Primary,Secondary` and `Size=SM,MD,LG`
- **THEN** a ComponentIR SHALL be created with two variant axes (`confidence: 'confirmed'`)

### Requirement: Map auto-layout to LayoutSpec
The adapter SHALL convert Figma auto-layout properties to IR LayoutSpec: `HORIZONTAL` → flex row, `VERTICAL` → flex column, `itemSpacing` → gap.

#### Scenario: Auto-layout frame mapped
- **WHEN** a Figma frame has layoutMode HORIZONTAL, itemSpacing 8, padding 16
- **THEN** the IRNode SHALL have `layout: { mode: "flex", direction: "row" }` with gap and padding

### Requirement: Mine unbound fills as inferred candidates
Fills and effects not bound to Figma variables SHALL be extracted as style candidates with `confidence: 'inferred'`.

#### Scenario: Unbound fill becomes inferred token
- **WHEN** a node has a solid fill `#FF4D24` not bound to any variable
- **THEN** a DesignToken candidate SHALL be created with `confidence: "inferred"`

### Requirement: Graceful degradation without variables
If the variables endpoint returns 403 or empty (plan limitation), the adapter SHALL fall back to mining all fills and effects as inferred candidates.

#### Scenario: Variables not available
- **WHEN** the variables endpoint returns 403 Forbidden
- **THEN** the adapter SHALL mine all fills/effects as inferred candidates
- **AND** SHALL log a warning
