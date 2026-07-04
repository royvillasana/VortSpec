## ADDED Requirements

### Requirement: Semantic token naming
Stage 3 (Token Inference) SHALL send all mined style groups to the LLM in a single batch call. The LLM SHALL assign semantic names following the `category/role/scale` convention (e.g. `color/primary/500`, `spacing/md`, `radius/lg`).

#### Scenario: Color tokens get semantic names
- **WHEN** style groups include `{ property: "background-color", value: "#2563EB", usageCount: 8 }`
- **THEN** the LLM SHALL assign a semantic name like `color/primary/500`
- **AND** the token SHALL have `confidence: 'inferred'` and `inferredBy: 'llm'`

#### Scenario: Typography tokens get semantic names
- **WHEN** style groups include font-size, font-weight, font-family values
- **THEN** the LLM SHALL group them and assign names like `type/heading/lg`, `type/body/md`

### Requirement: Role grouping
The LLM SHALL group tokens by role: primary, secondary, neutral, accent, semantic (success/warning/error), surface, border. Near-duplicate values (e.g. three greys within small delta) SHALL produce `near-duplicate-tokens` issues instead of auto-merging.

#### Scenario: Near-duplicate detection
- **WHEN** two mined values are visually similar (e.g. `#6B7280` and `#71717A`)
- **THEN** the system SHALL create a `near-duplicate-tokens` issue suggesting merge
- **AND** SHALL NOT auto-merge

### Requirement: Zod-validated structured output
The LLM response for token naming SHALL be validated against a Zod schema. If validation fails, the system SHALL retry once with the validation error appended. A second failure SHALL fall back to deterministic naming (`color/untitled-1`).

#### Scenario: Invalid LLM output
- **WHEN** the LLM returns malformed JSON
- **THEN** the system SHALL retry once with error context
- **AND** if retry fails, fall back to deterministic names

### Requirement: Promotion threshold
Only style groups with `usageCount >= 2` SHALL be promoted to tokens. Single-use values remain as flagged literals.

#### Scenario: Single-use value not promoted
- **WHEN** a style value appears only once
- **THEN** it SHALL NOT become a token
