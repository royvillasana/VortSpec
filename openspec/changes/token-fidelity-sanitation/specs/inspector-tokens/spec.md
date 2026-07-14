## MODIFIED Requirements

### Requirement: Tokens sourced from project files (no IR store)
The Tokens panel SHALL derive all tokens and resolved values from the project's files — the configured `token_file`, and the authoritative Figma variables via the Desktop Bridge when connected — with zod validation only at the parse boundary. It SHALL NOT depend on a canonical IR store or a normalization pipeline. Reconciliation between code tokens and Figma variables SHALL use the layered token resolver (link → name → value → alias), not name matching alone, so a token that exists under a different name is still recognized.

#### Scenario: Tokens load from the token file
- **WHEN** the Tokens panel opens for a project with a configured token file
- **THEN** tokens SHALL be parsed from the configured token file and rendered

#### Scenario: Figma bridge provides authoritative values
- **WHEN** the Figma variables are present
- **THEN** resolved values SHALL be taken from the Figma export and reconciled with the token file, flagging drift

#### Scenario: A value-equal token under a different name reconciles
- **WHEN** the code token `--font-size-md` (18px) has no name-equal Figma variable but Figma's `typography/font-size/md` is 18px
- **THEN** reconciliation SHALL match them via the resolver's value signal rather than reporting the token as unmatched

## ADDED Requirements

### Requirement: Token creation is deduplicated
Creating a token in the Inspector (or promoting a detected literal) SHALL be routed through the resolver first; when the value or name already exists in Figma or code, the panel SHALL reuse the existing token and tell the user which one, instead of creating a duplicate.

#### Scenario: Creating a duplicate is prevented
- **WHEN** the user tries to create a token whose value already belongs to an existing token/variable
- **THEN** the panel SHALL decline to create it and reuse the existing token, with a message naming it

### Requirement: Duplicates and orphans are surfaced with actions
The Tokens panel SHALL surface **duplicate** tokens (same value, different name) and **orphan** tokens (code-only, resolving to nothing in Figma, with where-used), and SHALL offer gated actions: collapse a duplicate to its canonical token, and push orphans back to Figma in one batch.

#### Scenario: Orphans shown with where-used and a push-back action
- **WHEN** the project has code tokens with no Figma counterpart
- **THEN** the panel SHALL list them with the components/sections that use them and a single action to add them to Figma

#### Scenario: Duplicates offered a collapse
- **WHEN** two tokens share a value under different names
- **THEN** the panel SHALL offer to collapse them to a canonical token (re-aliasing the rest), gated behind confirmation
