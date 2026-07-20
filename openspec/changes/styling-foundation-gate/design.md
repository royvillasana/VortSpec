## Context

VortSpec builds a token-driven component library via SDD-DE and renders it in Storybook. Two deterministic failures recur across projects and were confirmed on a real run (`20JulyProject`):

- **Skeletons**: `styling: tailwind` with `tailwindcss` installed but no `tailwind.config`, no `postcss.config`, no `@tailwind` entry — so utility classes (including token classes like `bg-brand-primary`, `text-body-regular-size`) emit no CSS. And because the components use *semantic token classes*, even a bare config is insufficient: the config must map every token from `tokens.css` into the Tailwind theme.
- **Storybook build failures**: components mix `export default` and named exports; generated stories and cross-component imports guess the wrong shape → `MISSING_EXPORT`. This is caught only when Storybook builds, which the flow runs *after* telling the user the build is done.

VortSpec already provisions Storybook deterministically via `ensureStorybook` (`packages/core/src/main/workspace/storybook-setup.ts`, exposed as an IPC and called from `GuidedFlow`/`RunApp`). The styling pipeline and a compile gate should follow the same pattern and run earlier in the sequence. Per invariant #1, VortSpec provisions scaffolding; it does not re-implement the agent — the methodology (`@royvillasana/sdd-de`) owns generating token-faithful components and the theme bridge; VortSpec guarantees the deterministic scaffolding and ordering.

## Goals / Non-Goals

**Goals:**
- Guarantee a working styling pipeline (config + postcss + entry CSS + preview import + deps + token→theme bridge) **before** the first build and before Storybook.
- Make token utility classes resolve, so components render styled from the first render.
- Reconcile default-vs-named export/import mismatches so Storybook builds.
- Run the compile/build gate **ahead of** the Storybook/Playground step.

**Non-Goals:**
- Supporting every styling system now — Tailwind first (it's what the generated components use); CSS-modules/vanilla-extract are future branches behind the same interface.
- Re-implementing token extraction — `tokens.css` remains the source of values; the bridge is derived from it.
- Rewriting components' styling by hand — the reconciler only fixes import/export *shape*, not styling.
- Pixel-level visual validation — that's `figma-visual-validation`.

## Decisions

**1. `ensureStylingPipeline(projectPath)` mirrors `ensureStorybook`.** New `styling-setup.ts` in the same directory, same IPC/preload wiring, idempotent, best-effort, returns a structured result (what it wrote, what was already present, deps installed). Alternative — fold it into `ensureStorybook` — rejected: styling is needed for the dev preview and the build too, not only Storybook, so it's a peer step.

**2. The token→theme bridge is generated from `tokens.css`, not hand-authored.** The config parses `tokens.css` at load and maps variables into the Tailwind theme by category (colors by value-type; `--text-*-size/-leading/-family` → fontSize/lineHeight/fontFamily; `--spacing-*`, `--radius-*`, `--shadow*`). This is exactly the self-parsing config that fixed `20JulyProject`, so it stays in sync when tokens are re-extracted. Alternative — emit a static theme object at extract time — also valid and is the methodology's job; VortSpec's deterministic fallback is the self-parsing config so a project is never left skeletonized even if the methodology didn't emit one.

**3. Idempotent and non-destructive.** If a config already exists, do not overwrite it — detect and skip (the user or methodology may have authored a better one). Only create what's missing; only append the preview import if absent. Report what was left untouched.

**4. Export convention: named exports for components.** The reconciler rewrites single-specifier relative imports (and stories) to match each module's actual exports (named↔default). The methodology's `component-standards.md` mandates named component exports so new generation is consistent; the reconciler is the repair path for already-generated code. Alternative — pick default — rejected: named exports compose better for multi-export component files (component + its CVA/variants), which the generator already emits.

**5. Gate ordering in the flow.** Sequence becomes: **styling foundation → build → compile/build gate → Storybook/Playground → verify**. The compile gate moving ahead of Storybook means a `MISSING_EXPORT` or unstyled pipeline is fixed before the user is shown a "ready" Storybook. Reuses the existing `ensureStorybook` call site; adds `ensureStylingPipeline` before it and the gate between build and Storybook.

## Risks / Trade-offs

- **[Overwriting a user's hand-tuned config]** → Never overwrite an existing config/postcss; only create when absent, and report what was skipped.
- **[Package-manager variance for the dep install]** → Detect the lockfile (npm/pnpm/yarn) and use the matching add command; if none can be determined, write the configs and surface a one-line "install postcss autoprefixer" fix-it rather than guessing.
- **[Messy/non-idiomatic token classes]** (`text-*-family` used as a text utility) → the bridge maps what it can (colors, sizes, spacing, radius, shadow); the remaining non-idiomatic classes are a *methodology* correctness issue (constrain generation), not something VortSpec can rewrite safely. Document the residue rather than silently "fixing" it wrong.
- **[Reconciler touching a non-component import]** → only rewrite single-specifier relative imports where the local name matches the target's actual export in the opposite form; never touch bare/namespace/multi-name imports; run against the type-check afterward.
- **[Self-parsing config adds Storybook build cost]** → parsing `tokens.css` once at config load is negligible next to the Vite build.

## Migration Plan

1. Add `styling-setup.ts` (`ensureStylingPipeline`) + the token→theme-bridge generator in core; wire the IPC/preload; unit-test the bridge and the idempotent/no-overwrite behavior.
2. Add the export reconciler (pure, tested) and expose it where the flow can run it before the gate.
3. GuidedFlow/RunApp: call `ensureStylingPipeline` before builds/Storybook; move the compile gate ahead of the Storybook/Playground step.
4. Methodology (`@royvillasana/sdd-de`): `extract-design-system`/`sync-tokens` emit the theme bridge; `component-standards.md` mandates named exports; `/storybook` generates matching imports. Bump + adopt.
5. Validate on `20JulyProject` (the fix is already proven there manually) and one fresh build end-to-end: styled from first render, Storybook builds without hand-holding.

Rollback: the provisioning is additive and non-destructive; disabling the new step restores prior behavior with no data migration.

## Open Questions

- Where the entry CSS lives and how the dev-preview (not just Storybook) picks it up — reuse `token_file`'s directory (`src/styles/`) and import order tokens-after-tailwind.
- Whether to also provision for the dev-preview harness (`dev-preview` capability) in the same step — likely yes, since the preview renders the same components; confirm the preview's CSS entry point.
- Should the reconciler run automatically pre-gate, or only surface findings for the agent to fix? Lean automatic for the mechanical default↔named case (safe, type-checked after), surface anything ambiguous.
