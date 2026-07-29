# design-system-readiness Specification

## Purpose
TBD - created by archiving change connect-enterprise-design-system. Update Purpose after archive.
## Requirements
### Requirement: Readiness validation, not extraction
Connecting an enterprise design system MUST produce a readiness report that validates each connected asset is present and usable, and MUST NOT extract or rebuild the design system as a side effect.

#### Scenario: Connecting runs validation
- **WHEN** the user finishes connecting an enterprise project's assets
- **THEN** VortSpec produces a readiness report with a pass/gap result per asset (tokens, components, knowledge base) instead of a generated token file or built components

### Requirement: Token readiness via the resolver
The readiness check MUST confirm the client's tokens are parseable and resolvable, reusing the token-fidelity resolver to verify component values map to their tokens without false "unmatched" or hardcoded values.

#### Scenario: Tokens resolve cleanly
- **WHEN** the client's token file (or Storybook `:root` custom properties) is validated
- **THEN** every token value resolves and the report shows the components' bound values matching their tokens by name/value/link, flagging any value that resolves to no token

### Requirement: Component readiness requires a story
The readiness check MUST confirm each detected component is importable/buildable and has a corresponding Storybook story, and MUST report any component that lacks a story as a fidelity gap.

#### Scenario: A component has no story
- **WHEN** a component in the client's library has no Storybook story
- **THEN** the report flags that component as "no story → lower fidelity" and marks that it will fall back to a placeholder stand-in rather than a harvested one

### Requirement: Knowledge-base reachability
The readiness check MUST confirm the connected knowledge base answers a probe query, and MUST report an unreachable or unauthorized knowledge base as a gap rather than failing silently.

#### Scenario: Knowledge base is reachable
- **WHEN** the knowledge-base connection is validated
- **THEN** the report shows the KB as reachable when a probe succeeds, or a clear reachability/auth gap when it does not

