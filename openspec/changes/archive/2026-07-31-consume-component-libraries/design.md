## Context

VortSpec has three design-source families (`design_source` in `.sdd-de/project.yaml`, enum at `setup.ts:22-32`):

| Family | Sources | Components come from |
|---|---|---|
| **Extract + rebuild** | `figma`, `github`, `zip`, `stitch`, `claude-design` | Detected, then hand-built from scratch via the 7-step cycle |
| **Provision / consume** | `library` (shadcn/radix/mui/chakra/…) | The library's own CLI copies source, or npm install + wrappers — **but wired incompletely** |
| **Consume** | `enterprise` | Pointer index into the client's real components; embed their Storybook; swap at generate |

`enterprise` is the only fully-wired consume path (`enterprise-consume.ts`, `enterprise-source.ts`): it validates the source, builds a pointer index (`EnterpriseComponentEntry`: `importPath`/`export`/`storyId`/`tier`), embeds the client's own Storybook (`resolveEnterpriseStorybookUrl`), snapshots light stand-ins, is excluded from auto-build (`useAutoComponentBuild.ts:65-71`), and swaps real components in at generate. **This is the template.** `library` was designed to consume but structurally rebuilds (see proposal §Why). This design generalizes the enterprise consume model to all component-library sources, keyed by library type.

Constraints: VortSpec runs library CLIs / installs packages through the **user's own local toolchain** (npm/npx) — never vendoring, proxying, or reimplementing libraries; it never calls Figma directly; every rendered value must reference a design token (CLAUDE.md).

## Goals / Non-Goals

**Goals:**
- Consume the library's *real* components per type; never regenerate look-alikes.
- Make "consume vs rebuild" a single predicate (`isConsumeSource`) enforced across foundation, auto-build, readiness, and the design reference — not per-source special-casing.
- Enumerate a library's real props/variants so the AI composes accurately without a rebuilt Storybook.
- For consume sources, replace the VortSpec-built Storybook with the library's own design system (palette screen and/or embedded vendor Storybook); point DESIGN.md at consumed code.
- Add Astryx (Meta) as a first-class installed-package source without hard-coding unconfirmed specifics.

**Non-Goals:**
- Multi-framework consume (target React first).
- Re-theming/forking a vendor library's internals (only thin token-mapped wrappers, or direct import + Provider).
- Replacing real Storybook for VortSpec-*built* design systems (Figma/rebuild sources keep `/storybook`).
- Auto-upgrading library versions or resolving peer-dep conflicts (surface, don't auto-fix).

## Decisions

### D1. One `isConsumeSource(config)` predicate, generalized from `enterprise`
Foundation (`useAutoFoundation.ts:74-82`), auto-build (`useAutoComponentBuild.ts:65-71`), readiness (`GuidedFlow.tsx:486`), and the design reference (`DESIGN_REFERENCE_CLAUSE` `sdd-prompts.ts:40-64`) all currently branch on `enterprise` only. Introduce `isConsumeSource(cfg)` = `enterprise` OR (`library` with a consume kind) and route all four through it. *Alternative (rejected):* duplicate the `enterprise` checks with `|| library` inline everywhere — fragile, misses seams, and won't cover future consume sources.

### D2. Library taxonomy drives the consume mechanism
Classify `component_library_kind` into **cli-registry / installed-package / headless** (keep `copy-source` as an alias for cli-registry to avoid churn), plus the non-library **styling** recognition:

| Kind | Consume | Enumerate props/variants | Tokens |
|---|---|---|---|
| **cli-registry** (shadcn, compatible registries) | Run real CLI `npx shadcn@latest add --yes <items>` (fallback: fetch `registry-item.json`, write `files[].content`, rewrite imports to aliases). Source lands in repo. | Read copied `.tsx` CVA `variants` maps; list via registry index; optionally shadcn's MCP. | Tailwind + CSS vars merged to global CSS (`cssVars`). |
| **installed-package** (MUI, Chakra, Mantine, Antd, **Astryx**) | `npm install <pkg>`; import from specifier. No source copy. Optional thin token-mapped wrapper per primitive. | Bundled `.d.ts` via react-docgen-typescript (capture inherited props); fallback vendor docs / MCP. Variants are prop unions. | Theme via Provider; `token_file` → theme/config source. |
| **headless** (Radix, React Aria) | Same as installed-package. | Same `.d.ts`; props are behavioral (`open`, `asChild`), not visual. | **None** — pair with the project's tokens (flagged). |
| **styling** (Emotion, styled-components) | **Not a component source.** Never offered as a library. | n/a | It *is* the styling mechanism (`setup.ts:47-54`). |

*Rationale:* the four models have genuinely different mechanics; a single "run a CLI" assumption (today's `copy-source` bias) breaks for packages. **Emotion placement:** it is a `styling` value, never a `component_library`; MUI/Chakra merely default their styling to emotion (`autoStyling` `setup.ts:185-186`). A team whose real system is an Emotion-*coded* library (`@company/ui`) is an **installed-package** consume (enumerate via `.d.ts`), not a "consume Emotion" case.

### D3. Real readiness check replaces the count proxy
Replace `libraryProvisioned = !isLibrary || total > 0` with a check analogous to `analyzeEnterpriseReadiness` (`enterprise-consume.ts:64-108`): cli-registry → the CLI ran and source files exist; installed-package/headless → the package resolves in `node_modules` and pointer entries exist. *Alternative (rejected):* keep the count proxy — any hand-added component falsely flips the gate and the real library may never be installed.

### D4. Pointer-shaped `components.json` for consume sources
Write entries mirroring `EnterpriseComponentEntry` (`importPath`/`export`/`storyId`/`tier`) instead of the rebuild-oriented `{name, level, figmaNodeId}` (`sdd-prompts.ts:142-166`). The AI composes from pointers → real `import` + `<Component/>` usage, no from-spec reproduction.

### D5. Author the missing `/provision-library` skill
`PROVISION_LIBRARY_PROMPT` references `.sdd-de/ai-specs/skills/provision-library/SKILL.md`, which is absent (`sdd-prompts.ts:103`). Create it with the per-type recipes (D2), or make the prompt fully self-contained. Prefer a skill so the recipe is versioned + testable.

### D6. Skip VortSpec Storybook; display the library's own design system
For `isConsumeSource`, do not install/build a VortSpec Storybook. Two display options, both already built:
- **Palette screen** (`DesignSystem.tsx`, `lite-source.ts`) — reads only tokens + `components.json` + stand-ins; independent of Storybook/DESIGN.md. Default consume-mode display.
- **Embedded vendor Storybook/docs** — generalize `resolveEnterpriseStorybookUrl` beyond enterprise (use the vendor's hosted docs URL as-is).
Relax CLAUDE.md's Path B hard gate so `/storybook`+`/design-doc` are not prerequisites for consume sources (enterprise already rides Path A light-first). *Rationale:* vendor libraries ship their own docs/prop tables; rebuilding a Storybook to *view* a third party is redundant — the only real value (prop extraction) comes from `.d.ts` docgen.

### D7. DESIGN.md points at consumed code, optional in consume mode
`GENERATE_PROMPT` (`DesignManifest.tsx:12-34`) hardcodes local `component_dir` source paths, `.variants.ts`, and `localhost:6006` URLs and `ls`-verifies them. For consume sources: emit the pointer import path + the vendor's docs URL, or drop the Components source rows and let pointer `components.json` be the machine index. `/design-doc` optional — DESIGN.md's unique value (brand/intent prose) lives in the KB for vendor/client systems.

### D8. Astryx as installed-package, specifics resolved at intake
Research indicates Astryx is an installed npm-package library (`@astryxdesign/core`, CLI + MCP for docs, StyleX-based CSS-var tokens, React ≥19). Wire it as **installed-package** with `library_import_base: @astryxdesign/core`. Do **not** hard-code CLI subcommands, MCP registration, theme/component counts, or versions — resolve at intake via the CLI/MCP or confirm with the user (Open Questions). *Rationale:* the mechanism is corroborated but the specifics are unconfirmed in research; hard-coding risks shipping wrong commands.

### D9. Intake detection auto-suggests the kind
Inspect the target repo: root `components.json` → cli-registry; UI package in deps (`@mui/*`, `@chakra-ui/*`, `@mantine/*`, `antd`, `@radix-ui/*`, `react-aria*`, `@astryxdesign/*`) → installed-package/headless; only `@emotion/*`/`styled-components` and no component lib → styling (no consume flow offered).

### D10. Per-library consume recipes (two camps)

| Library | Kind | Install | Theming artifact to EDIT | Per-component override | API enumeration |
|---|---|---|---|---|---|
| **shadcn/ui** | cli-registry (copy) | `npx shadcn@latest init` + `add <c>` | Global CSS `:root`/`.dark` CSS vars (Tailwind v4 OKLCH `@theme inline`) + `components.json` | Edit copied file's CVA `variants`, or `className` cn() | registry `/r/index.json` + `/r/<name>.json`; shadcn MCP; then `.d.ts` |
| **MUI** | installed-package | `npm i @mui/material @emotion/react @emotion/styled` | `createTheme({palette,typography,spacing,shape})` → `ThemeProvider` (`cssVariables:true` emits `--mui-*`) | `theme.components.Mui<Name>` (`styleOverrides`/`defaultProps`/`variants[]`); `sx` | bundled `.d.ts`; `Components<Theme>` slot keys |
| **Chakra v3** | installed-package (+ CLI snippets copied) | `npm i @chakra-ui/react @emotion/react` + `cli snippet add` | `defineConfig({theme.tokens,semanticTokens})` → `createSystem` → `ChakraProvider` | `theme.recipes.<c>`/`slotRecipes` (base/variants); `css={{}}` | `.d.ts` + `typegen` (`recipes.gen.ts`) |
| **Mantine** | installed-package | `npm i @mantine/core @mantine/hooks` + postcss | `createTheme({colors[10],primaryColor,spacing,radius,headings})` → `MantineProvider` (`--mantine-*` vars) | `theme.components.<C>` via `.extend({defaultProps,styles})`; Styles API | `.d.ts`; `data-variant`/`data-size` |
| **Ant Design v5** | installed-package | `npm i antd` | `ConfigProvider theme={{token, algorithm}}` (seed tokens + dark/compact algorithms) | `theme.components.<C>` scoped tokens; nested `ConfigProvider` | `.d.ts` (`ComponentToken`/`AliasToken`) |
| **Radix Primitives** | headless | `npm i radix-ui` | **None** — VortSpec owns tokens/CSS; style via `[data-state]`/`--radix-*` | target part `className`/data-attrs; `asChild` | per-package `.d.ts`; no registry/MCP |
| **Astryx** (Meta) | installed-package | `npm i @astryxdesign/core @astryxdesign/theme-neutral @astryxdesign/cli`; `npx @astryxdesign/cli init` | `defineTheme({...,tokens:{'--color-*':[light,dark]},components})` in `./src/themes/*.ts` → `astryx theme build`, or inject override CSS on `<Theme>` | `components:` block in `defineTheme`; per-instance `xstyle` | CLI `astryx component --list`/`--json`; MCP `astryx.atmeta.com/mcp`; `.d.ts` |

Camp drives the edit strategy: **copy-into-repo** (shadcn/Chakra-snippets/Radix) → VortSpec edits **real files in `component_dir`** (same as the built path); **node_modules import** (MUI/Chakra-core/Mantine/Antd/Astryx) → VortSpec **never forks source**, only generates/patches a single theme/config artifact or CSS-var file the runtime consumes.

### D11. Design tokens are the common customization target
`token_file` (in `project.yaml`) read by `getInspectorTokens` (`token-parser.ts:620`) is already the *single reader* feeding `designer.md`, the palette, light stand-in resolved values, compile-back (`compile.ts:30-34`), and generate-code. Every source keys off it — so a per-project token override propagates everywhere **if applied in the form each runtime understands.** The customization layer therefore centers on tokens, not per-source bespoke UIs. *Alternative (rejected):* a separate customization UI per library — fragments the surface and doesn't generalize to built/light/enterprise/draw sources.

### D12. Multi-format token writer (the biggest single build)
Today the write path only understands CSS `--name: value;` — `setInspectorTokenValue` → `replaceDecl` (`token-parser.ts:844-871`, regex on `--name:`). A JS/TS theme-object, SCSS `$var`, or JSON design-tokens `token_file` **silently no-ops**. Since installed-package libraries are themed by JS theme objects, add format-aware writers (CSS in v1; JS/TS theme-object AST-patch and SCSS/JSON next) so token edits succeed for any `token_file` shape. *Alternative (rejected):* only support CSS-var token files — excludes MUI/Chakra/Mantine/Antd theming.

### D13. Durable override overlay + per-source materializer
Introduce `.vortspec/theme-overrides.json` — a **durable** override map (global `{tokenName → value}`, per-component `{dataComponent → {variant/slot → override}}`), promoting the ephemeral live-preview `override-store.ts` model and generalizing what `light-serve.injectTokens` (`:32-53`) already does for light pages. Layer it inside `getInspectorTokens` so all readers see overlaid values. A **materializer** emits, per a `theme_apply` config, one of: injected `:root{--var}` override CSS (css-vars / enterprise overlay), a generated/patched theme-object file (MUI/Chakra/Mantine/Antd), or an Astryx `defineTheme` (rebuild vs runtime-CSS is an open question). *Rationale:* one map, many target formats — the only per-source difference is materialization.

### D14. Identity keying + enterprise safety + re-resolution
- **Per-component overrides key on `data-component`** — present on every stand-in/instance across all paths (`light-page.ts:63`, `palette.ts:125`, enterprise snapshots, `draw-generate.ts`) and already the compile join key (`compile.ts:96-107`). Materialized into each library's per-component lever (shadcn CVA edit, MUI `theme.components`, Chakra recipe, Mantine `.extend`, Antd `theme.components`, Astryx `defineTheme.components`).
- **Enterprise never in-place:** for enterprise, `token_file` points at the client's REAL source (must never be modified — `enterprise-consume.ts:157,196`). Personalization routes to the VortSpec-owned overlay resolved on top at preview/build, never `setInspectorTokenValue` on their file.
- **Re-resolve baked values:** light stand-ins/palette bake resolved values; a token edit triggers (or lazily re-resolves through) `deriveProjectLiteManifest`/`writeDesignerManifest` (`lite-source.ts:213-224`) via the dual-key *name* half (`lite-manifest.ts:22-43`) — no Figma/Storybook round-trip.

## Risks / Trade-offs

- **Prop enumeration reliability** (installed-package) → `.d.ts` via react-docgen-typescript can miss inherited/complex props (e.g. MUI `sx`). *Mitigation:* configure the TS program for inherited props; fall back to the vendor MCP/docs; cache the enumerated manifest.
- **Non-interactive CLI drift** (cli-registry) → a vendor CLI changes flags/prompts. *Mitigation:* pin the documented non-interactive flags; on failure, fall back to the fetch-write-rewrite registry path; surface the error, don't silently rebuild.
- **Headless libs have no tokens** → components render unstyled without a token layer. *Mitigation:* flag at intake; require the project's token source; treat as installed-package + external tokens.
- **Overlap with `provision-library-source`** → two changes touch the same seams. *Mitigation:* this change supersedes/absorbs it; archive that change or rebase its tasks under this one before apply.
- **Astryx specifics wrong** → shipping incorrect commands. *Mitigation:* D8 — resolve at intake, never hard-code; gate behind user confirmation.
- **Existing library projects** → behavior change on re-provision. *Mitigation:* behavioral-only; existing projects unaffected until re-provisioned; document in CLAUDE.md.
- **Theme-object generation fidelity** → a flat VortSpec token set doesn't 1:1 map to Mantine's 10-shade color arrays, Antd's seed→map→alias+algorithm layers, or MUI variant additions. *Mitigation:* generate shade ramps where a library needs them; map the subset that round-trips cleanly and surface what's approximate; keep the generated theme file VortSpec-owned + regenerable.
- **AST-patching a JS theme object** (multi-format writer) is materially harder than CSS regex (preserve comments/imports/spread). *Mitigation:* stage it — CSS in v1, JS/TS theme-object next; validate by re-reading the written value.
- **Astryx may be unverifiable/fictional** (npm 403; repo unconfirmed). *Mitigation:* D8 + verify packages resolve and run the library's doctor at setup; gate wiring on a successful install; never assume commands.

## Migration Plan

1. Land config + `isConsumeSource` + readiness (no user-visible rebuild yet) behind the existing `library` source.
2. Author the `/provision-library` skill + pointer inventory; wire the consume affordance in GuidedFlow.
3. Generalize Storybook-skip + display + DESIGN.md consume branch; relax the CLAUDE.md gate.
4. Add Astryx to the options (specifics resolved at intake).
5. Reconcile `provision-library-source` (archive/absorb).
- **Rollback:** the change is additive to the `library` source path; reverting restores the prior (count-gated) behavior. No data migration — `project.yaml`/`components.json` gain fields that older code ignores.

## Open Questions

1. **Astryx CLI/MCP specifics** — confirm exact `@astryxdesign/cli` subcommands + MCP registration; enumerate via MCP vs `component --list` vs `.d.ts`? Theme/component counts and beta versions differ across sources — pin from live npm/docs or ask.
2. **StyleX / React 19 constraint** — Astryx needs React ≥19 + a StyleX-aware build (or pre-built CSS). Gate/warn when the target isn't React 19, or default to the pre-built-CSS path?
3. **Wrapper policy (installed-package)** — thin token-mapped wrapper per primitive (current `PROVISION_LIBRARY_PROMPT` behavior), or import the vendor component directly with a theme Provider and no wrapper? Determines whether `component_dir` holds any VortSpec-authored files.
4. **Headless intake** — a first-class "headless + your tokens" intake, or fold under installed-package with a required external token source?
5. **In-house Emotion/styled coded libraries** — route through the new installed-package intake (point at `@company/ui`), or keep steering them to `enterprise`? The two overlap; a single "point at your coded library package/repo" intake may be cleaner.
6. **`copy-source` vs `cli-registry` naming** — keep `copy-source` as the alias, or rename with a `project.yaml` migration?
7. **Astryx apply strategy** — edit the `defineTheme` `.ts` and re-run `astryx theme build` (SSR-safe, slower), or inject a runtime override CSS on `<Theme>` (fast, but may flash per-component overrides on SSR)?
8. **Per-component override granularity/storage** — is `.vortspec/theme-overrides.json` keyed by `data-component` enough, or do per-slot/per-variant overrides (MUI `styleOverrides.<slot>`, Mantine Styles API, Chakra slot recipes) need a richer schema? How do overrides survive a re-provision / library version bump?
9. **Copy-source per-component edits** — for shadcn/Chakra-snippets, do per-component customizations edit the real CVA/recipe files in-place (source-owned) *and* get recorded in the override map for portability, or stay purely in-file?
10. **Enterprise overlay resolution point** — is the client-token overlay resolved only in VortSpec preview, or also injected into the client's generated build output (risking VortSpec artifacts leaking into the client repo)?
11. **Multi-format writer v1 scope** — which non-CSS formats ship first (JS/TS theme object, SCSS `$var`, W3C JSON design-tokens)?
