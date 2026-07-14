## Why

VortSpec matches code tokens to Figma variables by **normalized name only** (`normName`), and it mints a new token whenever it detects a value in code. Both break on real design systems. Validated against the Excellus *Web UI Base Components* project:

- **Name-only matching misses tokens that exist.** Of the Accordion's 11 bound Figma variables, only **4/11 resolve by name** — the other 7 (`spacing/padding/10`, `typography/font-size/md`, …) exist in the project as `--spacing-10`, `--font-size-md`, … but under names the generator simplified. They match perfectly **by value** (`10px`, `18px`, …) — name-only can't see that. A component generator using name-only would emit **7 broken `var()` refs out of 11**.
- **Blind token creation produces massive duplication.** The project has **283 color tokens but only 75 distinct values** — **208 redundant tokens**. `#007AC3` alone appears under **12 names**, including the primitive `color-excellus-blue-500` *and* the semantic `color-surface-surface-control` (which is an alias to that primitive in Figma, flattened to a look-alike hex). Detecting `#007AC3` in a component and minting another token would be duplicate #13.

The consequence: generated components don't reliably bind the same tokens the Figma component uses, and the token set bloats with look-alikes that have invented names. The fix is to (1) resolve tokens by more than their name and (2) never create a token whose value/name already exists — and to surface the genuinely code-only tokens so the user can push them back to Figma.

## What Changes

- **Multi-signal token resolver.** Replace name-only matching with a layered resolver: **normalized name → resolved value (per mode) → alias-graph position → remembered explicit link**. Layers 1–3 auto-resolve the vast majority; layer 4 is a one-click, persisted link (`.vortspec/token-links.json`) so a match survives future renames on either side — no naming convention required.
- **Dedup-before-create.** Before promoting a detected value to a new token, the resolver checks it against Figma variables and existing code tokens by **value and name**. A match → **reuse** the existing token (bind the component to it); no new token is minted.
- **Orphan reconciliation.** Tokens used in components that resolve to **nothing** in Figma are flagged as orphans, with **where they are used** (component, section). VortSpec presents them as one prompt — *"these N tokens aren't in Figma; add them back and keep components in sync?"* — and, on confirm, pushes them via the layered push (v0.1.24).
- **Component-token binding fidelity.** When a component is generated, each Figma variable it binds (from the design context) is resolved to the project's own token via the resolver, and the component emits `var(--our-token)` — never a raw hex, never Figma's raw name, never a broken ref. Unresolved bindings are surfaced, not silently hardcoded.
- **Sanitation pass for existing tokens.** Flag code tokens whose value equals a Figma variable under a different name (collapse to the canonical token) and flattened semantics whose value equals a primitive (re-alias to `var(--primitive)`), reclaiming the redundancy — all gated/previewed.
- **Non-goals:** no automatic un-reviewed renames or deletes (every collapse/link/push is user-confirmed); no change to how the `/sync-tokens` skill emits code (its alias-preservation is a separate, noted dependency); no new Figma network access (reuses the existing figma-cli / scoped-run boundary).

## Capabilities

### New Capabilities
- `token-resolver`: the layered name→value→alias→link matcher, shared by reconcile, dedup, component binding, and push — plus the persisted link store.
- `token-sanitation`: dedup-before-create, orphan detection with usage attribution, the push-back-to-Figma prompt, and the existing-token cleanup pass.

### Modified Capabilities
- `inspector-tokens`: reconciliation and token creation route through the resolver (not name-only); the panel surfaces **duplicates** (same value, different name) and **orphans** (code-only, with where-used) and offers collapse / push-back actions.

## Impact

- **Contracts (`packages/core/src/shared/inspector.ts`):** resolver result + match-signal enum; orphan + duplicate report shapes; `tokenLink` schema for `.vortspec/token-links.json`.
- **Core (`packages/core/src/main/inspector/`):** new `token-resolver.ts` (layered matcher); `figma-reconcile.ts` reconcile uses it; `token-parser.ts` create/promote paths call dedup-before-create; a sanitation analysis over the token set + component usage scan.
- **Push (`figma-push.ts`):** orphan push reuses `computePushPlan` + layered routing.
- **UI (`packages/ui/src/views/Inspector.tsx`):** duplicates/orphans surfaced with where-used; collapse + push-back gated modals; link-confirm affordance.
- **Files:** `.vortspec/token-links.json` (new, local-first); reconcile cache already exists.
- **Tests:** resolver unit tests (each signal + precedence), dedup/orphan detection fixtures from the Excellus data, reconcile-via-resolver, UI render tests.
- **Dependency (noted, out of scope here):** the `@royvillasana/sdd-de` `/sync-tokens` skill should emit alias-preserving code so semantics trace to primitives; the app-side resolver tolerates flattened output regardless.
