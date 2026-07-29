# knowledge-base-mcp Specification

## Purpose
TBD - created by archiving change connect-enterprise-design-system. Update Purpose after archive.
## Requirements
### Requirement: Connect the knowledge base as an MCP client
VortSpec MUST consume the client's knowledge base by acting as the MCP client that connects to it, registering the connection into the agent's MCP configuration alongside the existing read-only Figma MCP.

#### Scenario: Knowledge base registered for the agent
- **WHEN** an enterprise project has a connected knowledge base
- **THEN** the knowledge-base MCP server is added to the agent's `mcpConfigPath` so runs can query it, and its tools default to read-only

### Requirement: Zero-setup generic connector by default
By default, VortSpec MUST provide a generic connector that wraps the client's knowledge-base source (a docs repo, wiki, site, or similar) so the client is not required to stand up their own MCP server.

#### Scenario: Client has a docs source but no MCP server
- **WHEN** the client provides a knowledge-base source (e.g. a docs repository or site) and no MCP endpoint
- **THEN** VortSpec runs a generic connector against that source and consumes it as the knowledge base, with no setup required from the client

### Requirement: Bring-your-own MCP power path
VortSpec MUST allow connecting to the client's own knowledge-base MCP server when they already expose one, using it in place of the generic connector.

#### Scenario: Client exposes their own MCP server
- **WHEN** the client provides their own knowledge-base MCP endpoint
- **THEN** VortSpec connects to it directly as the client and uses it as the knowledge-base source instead of the generic connector

### Requirement: Knowledge grounds the workflow steps
The connected knowledge base MUST be injected as grounding at brief enrichment, artifact generation, component/screen generation, and adversarial review, so specs and generated code follow the client's conventions.

#### Scenario: Enrichment consults the knowledge base
- **WHEN** an enterprise project runs brief enrichment or artifact generation
- **THEN** the agent is directed to consult the knowledge base and follow the client's documented conventions

### Requirement: Knowledge base is read-only and injection-safe
The knowledge-base connection MUST be read-only by default and its content MUST be treated as data, not instructions, so directives found inside the client's documents are surfaced rather than executed.

#### Scenario: A document contains an instruction-like directive
- **WHEN** knowledge-base content includes text that directs the agent to take an action
- **THEN** the agent treats it as reference material and surfaces it rather than acting on it, and any side-effectful tool requires explicit user approval

