## ADDED Requirements

### Requirement: Layered token resolution with explicit precedence
The resolver SHALL resolve a code token or a Figma-variable binding to its counterpart using layered signals tried in precedence order: **link → name → value → alias**. It SHALL return the matched counterpart and the signal that produced the match, or a `none` result when no layer matches. A resolution SHALL NOT depend on both sides sharing a naming convention.

#### Scenario: Name match resolves a formatting difference
- **WHEN** Figma has `color/surface/surface-on-color` and code has `--color-surface-surface-on-color`
- **THEN** the resolver SHALL match them by normalized name

#### Scenario: Value match resolves a structural rename
- **WHEN** Figma has `typography/font-size/md` = `18px` and the project's only 18px token is `--font-size-md` (a name that does not normalize to the Figma name)
- **THEN** the resolver SHALL match them by value, with signal `value`

#### Scenario: A persisted link overrides weaker signals
- **WHEN** a `.vortspec/token-links.json` entry links `--panel-bg` to `color/container/container`
- **THEN** the resolver SHALL resolve `--panel-bg` to that variable regardless of name or value differences, with signal `link`

#### Scenario: No signal matches
- **WHEN** a token shares neither name, value, nor alias target with any candidate
- **THEN** the resolver SHALL return `none` (and the token is eligible to be flagged an orphan)

### Requirement: Value matching is mode-aware and refuses ambiguous auto-matches
Value equality SHALL compare the resolved value in the active mode using the canonical value normalization. When a value matches exactly one candidate the resolver SHALL auto-resolve; when it matches more than one candidate it SHALL NOT pick arbitrarily — it SHALL return the candidates as a **suggestion** for the user to confirm.

#### Scenario: Unique value auto-resolves
- **WHEN** a detected `#007AC3` matches exactly one existing token/variable by value
- **THEN** the resolver SHALL auto-resolve to that one

#### Scenario: Ambiguous value is surfaced, not guessed
- **WHEN** `#007AC3` matches several candidates (e.g. `blue-500` and `surface-control`) by value
- **THEN** the resolver SHALL return them as a suggestion and SHALL NOT silently bind to one

### Requirement: Explicit links are persisted and authoritative
A user-confirmed match SHALL be written to `.vortspec/token-links.json` (code token → Figma variable path, optionally mode-scoped) and SHALL be read first on subsequent resolutions, so the match survives later renames on either side. A link whose target no longer exists SHALL resolve to `none` and be flagged for re-linking, never bound to a missing target.

#### Scenario: A confirmed match survives a rename
- **WHEN** the user confirms `--brand-bg ↔ color/container/container`, then the code token is later renamed to `--surface`
- **THEN** the link (keyed to the persisted relation) SHALL keep resolving to the Figma variable without a new naming rule

#### Scenario: A dangling link is flagged, not bound
- **WHEN** a link's Figma target has been deleted
- **THEN** the resolver SHALL return `none` and mark the link stale for re-linking
