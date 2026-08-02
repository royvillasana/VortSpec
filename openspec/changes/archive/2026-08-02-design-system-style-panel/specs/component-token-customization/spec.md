## ADDED Requirements

### Requirement: Property-indexed view of the design system
The customization layer SHALL provide a reader that indexes a project's design system BY STYLE PROPERTY —
color, border-radius, spacing, shadow, typography — reporting, for each property, the tokens of that type
and, for each token, the components bound to it for that property. The index SHALL be derived from the
project's real tokens, screens, and component stand-ins rather than from a fixed per-library list, and SHALL
be overlay-aware so every value reported is the live one.

#### Scenario: Index reports tokens and their users per property
- **WHEN** the reader is asked for the border-radius property on a project whose screens round several components
- **THEN** it returns that project's radius tokens with, for each, the components that use it for border-radius, and each token's live value

#### Scenario: A token nothing uses is still reported
- **WHEN** the design system defines a token no component currently binds
- **THEN** the index reports it with an empty component list rather than omitting it

#### Scenario: A binding with no component identity is not misattributed
- **WHEN** a screen binds a token without marking the element's component
- **THEN** the binding contributes to the token's presence but is not attributed to any component

### Requirement: Re-pointing a component's property to a different token
The customization layer SHALL support changing WHICH design-system token a single component uses for a
given style property, keyed by `data-component`, without altering the token's own value and without
affecting other components bound to either token. The re-point SHALL be recorded in the durable overlay.

#### Scenario: One component moves to a different token
- **WHEN** a component's border-radius is re-pointed from one radius token to another
- **THEN** only that component renders with the new token's value; the tokens' own values are unchanged and other components using either token are unaffected

## REMOVED Requirements

### Requirement: Semantic-lever to token resolver
**Reason**: The fixed semantic-lever set (primary/secondary/tertiary colour, card radius, component stroke,
shadow, button styling) could not describe a real design system. Each lever hard-wired one token per design
source, so properties no lever named — the rest of a radius scale, all spacing, all typography — were
unreachable, and every gap was closed by hard-coding another name or alias. The property-indexed reader
above replaces it: it derives what exists instead of enumerating what VortSpec knows.

**Migration**: Consumers of the lever resolver move to the property-indexed reader. A lever maps onto
"a token within a property section": `color.primary` → the color section's brand token, `radius.card` → a
radius token, `button.style` → the Button rows within each property section. Values already written by the
lever editor need no migration — they are ordinary durable-overlay entries and are read back unchanged.
