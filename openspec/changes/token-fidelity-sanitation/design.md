## Context

Token matching in VortSpec is name-only (`normName`: lowercase, collapse `/ . _ -` + space). That handles *formatting* differences but nothing structural. Two facts from the Excellus *Web UI Base Components* project make the gap concrete:

- **Names diverge structurally even in VortSpec's own output.** The `/sync-tokens` generator kept `color/surface/*` 1:1 but simplified `typography/font-size/md → --font-size-md` and `spacing/padding/10 → --spacing-10`. So a component's Figma bindings resolve **4/11 by name**; the missing 7 exist and match **by value** (`18px`, `10px`, `"Open Sans"`, `27px`, `semibold`).
- **Values are heavily shared.** 283 color tokens, 75 distinct values, 208 redundant. Aliases were flattened to hex, so a semantic (`surface-control` `#007AC3`) is indistinguishable-by-value from its primitive (`blue-500` `#007AC3`).

The goal is a resolver robust to *how* tokens are authored on either side, plus a sanitation layer that stops duplicate creation and reconciles genuinely code-only tokens back to Figma.

## Goals / Non-Goals

**Goals**
- Resolve a token/binding to its counterpart across arbitrary naming, using name → value → alias-graph → remembered link.
- Never mint a token whose value or name already exists (Figma or code).
- Flag code-only tokens with where-used, and offer one-click push-back.
- Generated components bind the project's real tokens, provably the ones the Figma component uses.
- Reclaim existing redundancy (collapse look-alikes, re-alias flattened semantics) — always gated.
- Preserve VortSpec invariants: gated mutations, local-first plain files, zod at boundaries, no direct Figma access.

**Non-Goals**
- Automatic un-reviewed renames/deletes/merges.
- Changing the `/sync-tokens` skill's emitter (external package; noted dependency).
- Solving the theoretically-unsolvable case (two tokens sharing neither name, value, nor alias) automatically — that is exactly what the explicit link (layer 4) is for.

## Decisions

### D1: A layered resolver with explicit precedence
`resolveToken(candidate, index)` returns `{ match, signal }` where `signal ∈ name | value | alias | link | none`, tried in order:
1. **link** — a persisted `.vortspec/token-links.json` entry wins over everything (user intent is authoritative and durable).
2. **name** — `normName` equality (today's behavior; fast, unambiguous when it hits).
3. **value** — resolved value equality **per mode** via `normValue` (color/number/string). This is what recovers the Excellus 7/11.
4. **alias** — same alias-graph position: a code `var(--x)` whose target resolves to the same primitive as the Figma variable's alias target. Matches by *relationship* when name and value both drift.

Precedence is link > name > value > alias so a deliberate link can override a coincidental value collision, and an exact name beats a value guess. *Alternative considered:* a weighted score across signals. Rejected — ordered precedence is predictable and debuggable; a fuzzy score hides why something matched.

### D2: Value matching must be mode-aware and ambiguity-aware
Value equality uses the active mode's resolved value (reusing `variableValueInMode` + `normValue`). Because values are shared (75 distinct across 283 tokens), a value can match **many** candidates. Rule: a value match auto-resolves only when it is **unique** (exactly one candidate) *or* disambiguated by a weaker name affinity; otherwise it is surfaced as a **suggestion** for the user to confirm (which then writes a link). Never silently pick one of N. *Alternative:* pick the first. Rejected — that reintroduces wrong bindings.

### D3: Explicit links are the convention-free escape hatch
`.vortspec/token-links.json`: `{ "<code token normName>": "<figma variable slash path>" }` (+ optional mode scope). Written when the user confirms a suggested match or manually links. Read first by the resolver. This is what makes "no matter how they're created, it works" true for the residual cases — the link is remembered instead of requiring a naming rule. Same local-first pattern as `token-overrides.json` / `token-mode-map.json`.

### D4: Dedup-before-create is a resolver call at the creation boundary
`createInspectorToken` / literal-promotion first calls the resolver against the union of Figma variables + existing code tokens. On a match (name or unique value or link) it **refuses to create** and returns the existing token to bind to (with a message: *"reused `--x` — already exists as this Figma variable"*). Only a clean `none` proceeds to creation, and even then it is recorded as a potential orphan. *Alternative:* create then dedupe later. Rejected — cheaper and clearer to never create the dup.

### D5: Orphans carry provenance
The sanitation pass produces an **orphan report**: code tokens (and detected literals) that resolve to `none`, each with its **usages** from the existing component-source scan (`buildUsage`) — component + section/property. The UI batches these into the push-back prompt. Pushing reuses `computePushPlan` (layered routing + aliasing from v0.1.24). *Alternative:* push orphans individually. Rejected — the user wants one review of the whole gap.

### D6: Component-token binding reads the design context, then resolves
Component generation already has the Figma node's bound variables (name + value). Binding fidelity is: for each bound variable, `resolveToken` → emit `var(--match)`; on `none`, surface it (create via dedup-checked path, or flag orphan) — never hardcode a hex or emit a raw Figma name. The resolver is the single seam; generation stays engine-driven.

### D7: Sanitation of existing tokens is analysis + gated actions, never automatic
Two analyses over the current token set: **duplicates** (value-equal tokens under different names → propose collapse to the canonical, alias the rest) and **flattened semantics** (a semantic whose value equals a primitive → propose `var(--primitive)`). Both render as previewed, confirmable actions. Nothing rewrites the token file without approval.

## Risks / Trade-offs

- **Value matching is ambiguous at scale (75 values / 283 tokens)** → D2: auto-resolve only when unique; otherwise suggest-and-confirm (writes a link). Wrong auto-binds are the thing to avoid, so bias to surfacing.
- **Cross-brand primitives share values legitimately** (`grey-50 = #FFFFFF` across 5 brands) → not real duplicates; the dedup pass excludes primitive↔primitive collisions across brand modes and targets semantic↔primitive / semantic↔semantic look-alikes. Scope collapse suggestions to within-tier, cross-name.
- **Links can go stale** (target renamed/deleted in Figma) → resolver treats a dangling link as `none` + flags it for re-link; never binds to a missing target.
- **Over-eager push-back** → the orphan prompt is opt-in, batched, and shows where-used so the user decides per token; nothing is pushed without confirm.
- **Depends on alias-preserving code for the strongest layer-3 matching** → the resolver still works on flattened output (via value), just with less structural signal; the sdd-de emitter fix is complementary, not required.

## Migration Plan

1. Ship the resolver + `token-links.json` schema (additive; reconcile can opt in behind the same result shape).
2. Route `reconcile` and token creation through the resolver (value/link on top of name) — behavior-compatible when only names are used.
3. Add the sanitation analyses + orphan report (read-only first).
4. Wire the UI: duplicates/orphans surfaced, collapse + push-back + link-confirm (gated).
5. Component binding uses the resolver at generation time.

Rollback: each step is additive; without links/value the resolver degrades to today's name-only behavior.

## Open Questions

- **Link granularity:** per-token vs per-token-per-mode. Lean per-token with optional mode scope; confirm when wiring modes.
- **Auto-confirm threshold:** should a *unique* value match auto-write a link, or always ask once? Lean auto-link on unique + same-tier, ask on ambiguous. Confirm during prototype on the Excellus data.
- **Where component detection runs:** the resolver is app-side; whether literal detection also runs in the `/sync-tokens` engine run (to dedup at generation) is a follow-up integration with the external skill.
