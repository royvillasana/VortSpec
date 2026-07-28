# Token fidelity — the layered resolver + sanitation model

VortSpec's promise is that generated code references **real design tokens**, never a hardcoded hex
or pixel value, and that the code↔Figma token mapping is correct even when names drift. This doc
describes the model behind that: the layered resolver, the sanitation actions built on it, and the
`.vortspec/token-links.json` contract.

## The problem

A code token and its Figma variable rarely line up one-to-one:

- The token extractor may **rename** a variable (`typography/font-size/md` → `--font-size-md`).
- Two tokens can share a **value** (a semantic role and the primitive it aliases).
- A token can exist in code but have **no Figma counterpart** (an orphan), or vice-versa.

Matching on name alone reports false "unmatched", and creating a token per apparent miss produces
duplicates. The resolver fixes both.

## The layered resolver

`resolveToken(candidate, index, { links })` (`packages/core/src/main/inspector/token-resolver.ts`)
maps a candidate to its counterpart using signals tried in **precedence order** — the first that
fires wins:

| Signal  | Basis | Why it ranks where it does |
|---------|-------|-----------------------------|
| `key`   | The Figma variable's publish-stable **variableKey** | Survives renames *and* value changes — authoritative when present. |
| `link`  | A user-confirmed durable link (see below) | Explicit human intent; beats any inference. |
| `name`  | Normalized name equality | The obvious case (case / separator / formatting insensitive). |
| `value` | Resolved-value equality, **mode-aware** | Recovers a renamed token — but only auto-resolves when the value is **unique**; multiple hits return `suggestions` for confirmation, never a guess. |
| `alias` | Same alias-graph position (both point at the same primitive) | Last resort when name and value both drift. |

No match → `{ match: null, signal: "none" }` (with `suggestions` when a value was ambiguous, or
`staleLink: true` when a link's target is missing).

The resolver is **pure** — the link map is passed in — so it's the single seam behind every
higher-level action:

- **Reconcile** (`getInspectorTokens`) runs each token through the resolver, so a value-equal token
  under a different name reconciles instead of showing "Figma-only".
- **Dedup-before-create** refuses to create a token that resolves to an existing one, returning the
  reused token instead.
- **Orphan detection** = tokens that resolve to `none`, reported with where-used.
- **Component-token binding** (`resolveComponentBindings`) maps each Figma-bound value a component
  uses to `var(--token)` at generation time — see below.

## Component binding — never hardcode

`resolveComponentBindings(bindings, projectTokens, { links })` resolves every Figma variable a
component binds to and returns, per binding, the CSS it should emit:

- a match → `css: "var(--token)"` (the project token, **not** the Figma path);
- no match → `css: null`, `signal: "none"` (+ `suggestions`), so the caller **dedup-creates** a
  token or flags an orphan — never inlines the literal or emits a raw Figma name / dangling `var()`.

The component-build prompt (`DESIGN_REFERENCE_CLAUSE` in `sdd-prompts.ts`) carries this rule
explicitly, so agent-generated components follow the same discipline. Validated on the Excellus
Accordion: all 11 bound variables resolve to real project tokens (4 by name, 7 by value), zero
hardcoded values.

## Sanitation actions

- **Orphans** — push code-only tokens back to Figma with `computeOrphanPushPlan(tokens, confirmedNames,
  figmaVars)`: restricted to the set the user confirms, layer-routed (primitive / semantic / component),
  aliasing existing siblings, skipping any raced in-sync token so it never duplicates. Gated; feeds the
  existing `figma:pushVariables` apply flow.
- **Duplicates** — value-equal tokens are grouped with a gated "collapse to canonical" action
  (`collapseTokenToAlias`) that re-points the duplicate to `var(--canonical)` in the token file.

## The `.vortspec/token-links.json` contract

A **local-first** store (like `token-overrides.json`) of durable code-token → Figma-variable links.
Shape: a map of the normalized code-token name → the Figma variable's slash path (optionally per
mode). Links are read **first** by the resolver (the `link` layer), so a confirmed match survives a
rename on either side. A link whose target no longer exists resolves to `none` with `staleLink: true`
rather than binding the wrong variable.

The Inspector surfaces the match signal on each token ("matched by value/alias/…") and offers **Pin
this match →** on an inferred (value/alias/key) match — which writes the link so the binding becomes
durable. A token already matched by `link` shows "✓ linked".
