## 1. Config & the `isConsumeSource` predicate

- [x] 1.1 Broaden `component_library_kind` in `setup.ts` to `cli-registry | installed-package | headless` (keep `copy-source` as an alias for `cli-registry`); update `libraryKind()` (`setup.ts:148-151`) and `COMPONENT_LIBRARY_OPTIONS` (`setup.ts:133-142`) accordingly.
- [x] 1.2 Add the richer library descriptor to the config schema written by `buildProjectYaml` (`setup.ts:274-279`): `library_registry`, `library_install_cmd`, `library_add_cmd`, `library_import_base`, optional `library_mcp`; keep `token_file` pointing at the theme/config source (installed-package) or global CSS (cli-registry).
- [x] 1.3 Add an `isConsumeSource(config)` helper in `packages/core` (= `enterprise` OR a `library` with a consume kind) and export it for UI + prompt use.
- [x] 1.4 Recognize CSS-in-JS (`emotion`, `styled-components`) strictly as a `styling` value; ensure it can never be recorded as a `component_library`.

## 2. Enforce consume over rebuild

- [x] 2.1 Generalize the `enterprise` early-return in `useAutoComponentBuild.ts:65-71` to `isConsumeSource` so no consume-source component is swept into `buildChunkPrompt`.
- [x] 2.2 Add a consume-source branch to `useAutoFoundation.ts:74-82` that dispatches the library provision/index flow instead of the generic Figma-style extract template.
- [x] 2.3 Replace the count proxy `libraryProvisioned = !isLibrary || total > 0` (`GuidedFlow.tsx:486-487`) with a real readiness check analogous to `analyzeEnterpriseReadiness` (`enterprise-consume.ts:64-108`): CLI ran + files exist (cli-registry) or package resolves + pointer entries exist (installed-package/headless).
- [x] 2.4 Update the GuidedFlow roster affordance so consume-source projects show a consume/provision action rather than a from-scratch "build" for library-shipped components.

## 3. Consume mechanisms & the missing skill

- [x] 3.1 Author `.sdd-de/ai-specs/skills/provision-library/SKILL.md` (referenced by `sdd-prompts.ts:103` but absent) encoding the per-type recipes: cli-registry (run the real CLI non-interactively; fallback fetch-write-rewrite from `registry-item.json`), installed-package (install + optional thin token-mapped wrapper), headless (install + require external tokens), reject CSS-in-JS.
- [x] 3.2 Update `PROVISION_LIBRARY_PROMPT` (`sdd-prompts.ts:99-121`) to route by the new kinds and to be self-consistent with the new skill.
- [x] 3.3 Write pointer-shaped `components.json` entries (`importPath`/`export`/`storyId`/`tier`, mirroring `EnterpriseComponentEntry` `enterprise-consume.ts:29-40`) for consume sources; update the rescan writer (`sdd-prompts.ts:142-166`) and the `extract-design-system` skill's non-Figma path.
- [x] 3.4 Add a consume-library branch to `DESIGN_REFERENCE_CLAUSE` (`sdd-prompts.ts:40-64`) making the authoritative reference the real component module/package, not a Figma node.

## 4. Prop / variant enumeration for grounding

- [x] 4.1 cli-registry: read variants from the copied component's CVA `variants` map + the registry index; expose them in the inventory.
- [x] 4.2 installed-package / headless: enumerate props/variants from bundled `.d.ts` via react-docgen-typescript (configure the TS program to capture inherited props), with a vendor-docs/MCP fallback; cache the enumerated manifest.

## 5. Storybook skip & design-system display

- [x] 5.1 Make `storybook/SKILL.md` and the `RunApp.tsx:393-418` backstop skip installing/serving a VortSpec Storybook when `isConsumeSource`.
- [x] 5.2 Generalize `resolveEnterpriseStorybookUrl` (`enterprise-source.ts:73-93`) beyond enterprise so any consume source with a vendor Storybook/docs URL embeds it as-is.
- [x] 5.3 Confirm the palette screen (`DesignSystem.tsx`, `lite-source.ts`) renders a consume-source project's pointer inventory + tokens as the default design-system display.

## 6. DESIGN.md consume mode

- [x] 6.1 Add a consume-source branch to `GENERATE_PROMPT` (`DesignManifest.tsx:12-34`) + `design-doc/SKILL.md`: emit pointer import paths + vendor docs URLs (not `localhost:6006`), or drop the Components source/variants rows.
- [x] 6.2 Make `/design-doc` optional for consume sources (no longer a screen-creation prerequisite).

## 7. Astryx (Meta) integration

- [x] 7.1 Add Astryx to `COMPONENT_LIBRARY_OPTIONS` (`setup.ts:133-142`), classified as `installed-package`, with `library_import_base: @astryxdesign/core`.
- [x] 7.2 Resolve Astryx's concrete install/enumeration/token commands at intake via its CLI/MCP (or user confirmation) — do NOT hard-code CLI subcommands, MCP registration, counts, or versions (see design Open Questions 1–2). — RESOLVED from astryx.atmeta.com/docs (2026-07-31): install + `npx @astryxdesign/cli init` CONFIRMED; tokens are CSS custom properties → `theme_apply: css-vars` (not the bespoke `astryx-defineTheme`); enumeration is the CLI `astryx component [Name]` (plain text, **no --json, no MCP** — the MCP assumption is dropped). The option hint + a `project.yaml` comment surface the constraint to whoever selects Astryx. The one residual gap — the exact `defineTheme()` schema — is documented ONLY behind the `astryx docs theme` CLI (the web page 404s), so custom-theme redefinition is explicitly flagged as CLI-resolved-at-provisioning and the user is told VortSpec cannot redefine the theme abstractly.
- [x] 7.3 Wire the Astryx metadata source through the docgen/MCP enumeration path from §4 (no Storybook assumption). — The Astryx theming contract + `PROVISION_LIBRARY_PROMPT` step 4b route enumeration through the confirmed CLI (`astryx component` / `astryx component <Name>` / `astryx docs tokens`, invoked via `node node_modules/@astryxdesign/cli/bin/astryx.mjs`), NOT `.d.ts`/Storybook/MCP; `.d.ts` enumeration remains a silent fallback if the package ships types.

## 8. Intake detection

- [x] 8.1 In the `setup` skill + `setup.ts`, inspect the target repo (root `components.json` → cli-registry; known UI package in deps → installed-package/headless; only `@emotion/*`/`styled-components` → styling) to auto-suggest the kind.

## 9. Toolkit docs & gate relaxation

- [x] 9.1 Relax CLAUDE.md's Path B hard gate so `/storybook` + `/design-doc` are explicitly NOT prerequisites for consume sources; document the extract-vs-consume source families and where each lands its source of truth.

## 10. Reconcile the overlapping in-flight change

- [x] 10.1 Fold the in-flight `provision-library-source` change into this one (archive it or rebase its `library-design-source` tasks under this change) so the seams aren't touched twice.

## 11. Per-library consume + customize recipes

- [x] 11.1 shadcn (cli-registry): `init` + `add`; import via `components.json` alias; theming = global CSS `:root`/`.dark` vars + `components.json`; per-component = copied CVA `variants`; enumerate via registry JSON/MCP + `.d.ts`.
- [x] 11.2 MUI (installed-package): install `@mui/material @emotion/react @emotion/styled`; theming = generated `createTheme({palette,typography,spacing,shape})` + `ThemeProvider`; per-component = `theme.components.Mui<Name>`; enumerate via bundled `.d.ts`.
- [x] 11.3 Chakra v3 (installed-package + CLI snippets): install + `cli snippet add`; theming = `defineConfig({theme.tokens,semanticTokens})` → `createSystem`; per-component = recipes/slotRecipes; enumerate via `.d.ts` + `typegen`.
- [x] 11.4 Mantine (installed-package): install + postcss; theming = `createTheme({colors[10],…})` (generate shade ramps); per-component = `.extend`; enumerate via `.d.ts`.
- [x] 11.5 Ant Design v5 (installed-package): install `antd`; theming = `ConfigProvider theme.token` + algorithm; per-component = `theme.components.<C>`; enumerate via `.d.ts` token interfaces.
- [x] 11.6 Radix (headless): install `radix-ui`; no built-in tokens — pair with the project's tokens; per-part `className`/data-attrs; enumerate via `.d.ts`.
- [x] 11.7 Astryx (installed-package): install `@astryxdesign/core @astryxdesign/theme-neutral @astryxdesign/cli` + `cli init` (verify packages resolve / run its doctor first); theming = `defineTheme` `.ts` (`astryx theme build`) or injected `<Theme>` override CSS; per-component = `defineTheme.components`; enumerate via CLI `--json`/MCP.

## 12. Per-project token/theme customization (any component source)

- [x] 12.1 Multi-format token writer — extend `token-parser.ts` (`replaceDecl`/`parseTokensFromCss`, CSS-only today) with JS/TS theme-object AST writers (+ SCSS/JSON), so `setInspectorTokenValue` succeeds for non-CSS `token_file`s; surface an error instead of a silent no-op.
- [x] 12.2 Durable override map — add `.vortspec/theme-overrides.json` (global `{tokenName→value}` + per-component `{dataComponent→override}`); promote the ephemeral `override-store.ts` model to durable; layer it inside `getInspectorTokens` (`token-parser.ts:620`) so all readers see overlaid values.
- [x] 12.3 Materializer — generalize `light-serve.ts:injectTokens` into a shared applier that emits, per `theme_apply`: injected `:root{--var}` CSS (css-vars/enterprise overlay), a generated/patched theme-object file (MUI/Chakra/Mantine/Antd), or an Astryx `defineTheme`.
- [x] 12.4 Enterprise overlay guard — route personalization writes for enterprise (and any source whose `token_file` points at unowned code) to the overlay, never `setInspectorTokenValue` on the real file (`enterprise-consume.ts:157,196`).
- [x] 12.5 Re-resolution trigger — on a token edit, re-run `deriveProjectLiteManifest`/`writeDesignerManifest` (`lite-source.ts:213-224`) via the dual-key name half so baked stand-ins/palette re-theme (no Figma/Storybook round-trip).
- [x] 12.6 Token↔library-theme-key map — add the consumed library's theming contract as a third target to the token resolver (`token-resolver.ts`, alongside `token-links.json`/`token-key-wiring`) so one edit fans out to code, Figma, and the library.
- [x] 12.7 Per-component override keying — use `data-component` (`compile.ts:96-107`) as the per-component key; materialize into each library's per-component lever (shadcn CVA / MUI `theme.components` / Chakra recipe / Mantine `.extend` / Antd `theme.components` / Astryx `defineTheme.components`).
- [x] 12.8 Config — add `theme_apply` (`css-vars | theme-object:<mui|chakra|mantine|antd> | astryx-defineTheme | overlay-injected`) to `project.yaml` and set it per detected library kind.

## 13. Verification

- [x] 13.1 A shadcn (cli-registry) fixture: provisioning runs the real CLI, source lands in `component_dir`, readiness flips only after the CLI ran, and neither auto-build nor manual build reimplements any component. — VERIFIED via `consume-verification.test.ts`: readiness gates on real source in `component_dir` (false when empty → true after a file lands), intake detects shadcn from `components.json`, `isConsumeSource("library")` guards the builder off. NOTE: the live `npx shadcn` execution is environmental (network/toolchain); the fixture reproduces the on-disk state it produces and verifies the gate.
- [x] 13.2 An installed-package fixture (MUI or Chakra): package installs, components import from the specifier, props/variants enumerate from `.d.ts`, no VortSpec Storybook is built, and the palette screen displays the consumed system. — VERIFIED: readiness gates on the package resolving in `node_modules`; `enumeratePackageComponent` reads `ButtonProps` from a bundled `.d.ts` (variant union + optional flag); `isConsumeSource` guards the Storybook backstop. NOTE: the live `npm install` is environmental; the fixture reproduces the installed `node_modules` state.
- [x] 13.3 An Emotion-only fixture: recognized as a styling strategy, never offered as a component library to consume. — VERIFIED: `detectLibrary` flags `@emotion/styled` and `styled-components` as `stylingOnly` with no `library`; neither appears in `COMPONENT_LIBRARY_OPTIONS`.
- [x] 13.4 Customization — editing a token re-themes built, light-page, and consumed-library components; a JS theme-object `token_file` write succeeds (not a no-op); a per-component `data-component` override changes only that component. — VERIFIED: a `theme.ts` write lands `main: "#635bff"`; a durable-overlay edit re-themes every reader via `getInspectorTokens`; a `materializeComponentCss` override is `[data-component]`-scoped (Button only, Card untouched).
- [x] 13.5 Enterprise customization — personalization applies via the overlay and the client's real token file is never modified. — VERIFIED: an enterprise edit leaves `client-tokens.css` byte-for-byte, writes `primary` to `.vortspec/theme-overrides.json`, and the reader sees the overlaid value.
