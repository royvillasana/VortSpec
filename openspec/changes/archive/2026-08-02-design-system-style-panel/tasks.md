# Tasks

Organized into **phases**. Every feature ships in this change — the phases are ordering, not scope cuts.
Each phase ends with its own verification so it can be judged done on its own, and each leaves the app in a
working state.

## 0. Settle the baseline

- [x] 0.1 Archive `design-system-token-editor` so its shipped foundations (durable overlay writes + consume guard, `@import` resolution, `light-dark()` handling, screen-drift reader, live refresh) land in the main specs and this change's deltas apply on top of a settled baseline.

## Phase 1 — Sidebar shell (structure only, no behavior change)

- [x] 1.1 Restructure `RunApp`'s `sidebarBody` / `DesignPanel` BELOW the existing `Sitemap` (Pages) region, which stays on top: layer tree region (own scroll), a drag-resizable boundary, then a tab bar with **Design Attributes** and **Library**.
- [x] 1.2 Replace `LayersRegion`'s fixed `max-h-44` with the resizable height; persist it per project and default to today's so existing layouts don't jump.
- [x] 1.3 Move `SelectionHeader` + `VariantSection` + `PropertySection`s into the Design Attributes tab body, unchanged in content — this step must alter no control, only its container.
- [x] 1.4 Add the selected node's dimensions beside its name in the Design Attributes header.
- [x] 1.5 Persist the active tab per project; keep the tree and its scroll position stable across tab switches.
- [x] 1.6 Add the tree header's search (`⌕`): filter nodes by name, case-insensitive, keeping ancestors visible so a match's place in the hierarchy stays readable; clearing restores the full tree with the selection intact.
- [x] 1.7 Verify: selection, variant switching, field edits and the ChangesBar behave exactly as before — the re-parenting changed nothing functionally.
- [x] 1.8 Component test: Pages → tree → resizable boundary → two tabs; selecting fills Design Attributes; switching tabs leaves the tree and its scroll untouched; search narrows and clears correctly.

## Phase 2 — Library: Manual mode

- [x] 2.1 Group the project's tokens into the five sections using the `type` the parser already assigns (`color | typography | spacing | radius | shadow`); `other` stays out (it is the Tokens tab's).
- [x] 2.2 Rows FOLLOW THE PROJECT: every token of a section's type becomes a row under its own name — no fixed role list, so nothing is stranded because VortSpec has no name for it.
- [x] 2.3 Implement `getDesignSystemLibrary(projectPath)` returning sections → their tokens, overlay-aware so every value is live. Pure core + I/O shell.
- [x] 2.4 Expose over IPC (`designSystem:library`) + `api`.
- [x] 2.4b A consumed library's token file must import EVERYTHING its design system declares. Astryx's spacing scale lives in `@astryxdesign/core`'s stylesheet, which provisioning does not import — only `theme-neutral/theme.css` — so the Spacing section reads empty on a real Astryx project even though the library has a full scale. Fix the provisioning guidance (`setup.ts`) so the token file imports the library's core stylesheet too, and re-check each seeded library for the same omission.
- [x] 2.5 Build `LibraryPanel` taking `{ project, onEdited }` and nothing surface-specific, so both docks can mount the identical component.
- [x] 2.6 Render the Mode switch (Manual · Presets) and the five Manual sections: COLORS, TYPOGRAPHY, SPACING, BORDERS, SHADOWS.
- [x] 2.7 Render each row with its token name and live value, typed by section (color swatch, length stepper, font preview, shadow parts); state an empty section plainly rather than inventing rows.
- [x] 2.8 Edits write via the existing `theme:setTokenOverride` — no new write path; validate per the row's type before writing.
- [x] 2.9 Live Preview: a self-contained sample rendered from the current resolved values, updating on every committed edit.
- [x] 2.10 Put the screens→design-system drift proposal on the affected row inside its section, replacing the top-of-panel banner.
- [x] 2.11 Mount `LibraryPanel` as the Playground sidebar's Library tab.
- [x] 2.12 Unit tests: sections group correctly under the project's own names with live overlay-aware values; every token of a section's type appears for a `container/card/pill/element` radius scale (the case the lever model stranded).
- [x] 2.13 Fixture test: editing a Library value writes the overlay and the vendor's real files are untouched.

## Phase 3 — Font family picker

- [x] 3.1 Enumerate the PROJECT's fonts — the families already named by its `--font-family-*` tokens.
- [x] 3.2 Enumerate SYSTEM fonts via Chromium's `queryLocalFonts()`. NOTE: the planned `local-fonts` permission grant was NOT implemented — installing `setPermissionRequestHandler` flips Electron's default for EVERY permission from grant-most to deny-most, which would silently break clipboard/media. An unavailable or declined API falls back to a curated system list, leaving the other three sources working.
- [x] 3.3 Enumerate the connected FIGMA file's fonts from its text styles; absent for a project with no Figma source.
- [x] 3.4 Ship a curated ~70-family Google Fonts snapshot so the picker is instant and works offline.
- [x] 3.5 Fetch the remaining catalog once, on demand — when the user scrolls past the snapshot or searches beyond it — and append it.
- [x] 3.6 Render the picker with each family LABELLED by source, previewing each in its own face. A Figma-sourced family is explicitly marked as coming from the Figma library, since matching the design is exactly why it is worth picking.
- [x] 3.7 Record the chosen family (and the weights in use) on the design system, and LOAD it in all three places: the panel's Live Preview, the served light pages (emit the stylesheet link alongside the token CSS already injected), and generated framework code.
- [x] 3.8 Keep every family a STACK ending in `system-ui, sans-serif`, and report when the chosen family did not resolve or fetch instead of silently falling back.
- [x] 3.9 Unit test: the picker returns families from all four sources, each labelled; a failing system enumeration leaves the other three working.
- [x] 3.10 Fixture test: choosing a Google family records it and emits its stylesheet link into the served page alongside the token CSS.

## Phase 4 — Presets

- [x] 4.1 Define the preset shape: a name plus ROLE → value assignments (never raw token names), with light/dark pairs, so a preset stays applicable to a project whose tokens are named differently.
- [x] 4.2 Author the three built-ins — **Ocean** (SF Pro · Blue · 4px), **Forest** (Poppins · Earth · 12px), **Sunset** (Montserrat · Coral · 6px) — per the value table in design D5c, tuned against the Live Preview.
- [x] 4.3 Model **Default** as the SOURCE design system, not a preset: nothing authored or stored for it; it is the consumed library's own values, or the connected Figma file's. Always offered, never deletable.
- [x] 4.4 Tag overlay entries preset-owned vs user-owned; a Manual edit to a preset-written token transfers it to the user. Selecting Default removes only preset-owned entries, so the preset's contribution is undone while the user's own personalization survives.
- [x] 4.5 Add a VortSpec-owned preset store beside the overlay for user-created presets and the active marker; never write the vendor's files.
- [x] 4.6 Presets mode: list Default + built-ins + user presets with a summary line, exactly one marked active.
- [x] 4.7 Apply → resolve each role against this project, write the resolved ones via `theme:setTokenOverride` (through `applyLightDark` so a `light-dark()` token keeps both modes), and report which roles applied, which were INTRODUCED, and which were skipped.
- [x] 4.8 Preview the apply BEFORE writing: which tokens change, which are introduced, which roles are skipped. Say plainly that switching overwrites values edited since the last apply.
- [x] 4.9 "Create New Preset" captures the current values under a name; "Import Preset" reads the same shape from a file and validates it before offering to apply.
- [x] 4.10 Fixture: applying a preset writes every resolved role, INTRODUCES roles the project lacked, skips and REPORTS the unresolvable ones, marks itself active, and leaves the vendor's files untouched.
- [x] 4.11 Fixture: selecting Default after a preset restores the SOURCE design system — the preset's entries are removed and the user's own edits survive.
- [x] 4.12 Fixture: editing after applying a built-in changes the project only — the built-in's definition is byte-identical and re-applying restores its original values.

## Phase 5 — Replicate to the Design-tokens sidebar, and retire the lever model

- [x] 5.1 Mount the SAME `LibraryPanel` in the Design-tokens sidebar, replacing the lever editor there — replicated, not moved.
- [x] 5.2 Keep both mounted instances in sync: re-read after any local edit AND on the workspace-watcher event for the overlay file, so an edit on one surface can never leave the other stale-but-editable. The watcher is already reference-counted, so two subscribers are safe.
- [x] 5.3 Make the panel width-responsive with no fixed-width assumptions — the two docks are different widths — and check it in both. (Verified: every row uses flex + `min-w-0` + truncation; the only width constraint in the panel is a `max-w` on an error message.)
- [x] 5.4 Delete `DesignSystemLever`, `LEVERS`, `LEVER_TOKENS`, the alias sets, `resolveLevers`/`resolveDesignSystemLevers`, the `designSystem:levers` channel, and the old `DesignSystemEditor`.
- [x] 5.5 Keep the property-level helpers the lever module carried (`parseLightDark`, `applyLightDark`, `swatchHex`, `controlFor`, `isValidLeverValue`, `sameDesignValue`) and re-home them; re-express the drift reader against the property-grouped reader.
- [x] 5.6 Confirm no overlay data migration is needed — values written by the lever editor are ordinary durable-overlay entries and must read back unchanged.
- [x] 5.7 Component test: with BOTH surfaces mounted, an edit on one leaves the other showing the new value — never the old one still editable.

## 9. Layout, from use (found in review)

- [x] 9.1 Colours render as a grid of perfect squares with the token name, not one full-width row each — 100+ colours with a swatch, a `light-dark(…)` input and a hint line is several screens of scrolling to read a palette. The value appears only for the swatch the user opens.
- [x] 9.2 Every other section pairs two controls to a row. EXCEPT shadows, whose values (`0 2px 4px light-dark(oklch(…), oklch(…))`) would truncate to nothing at half width — they stay full width.
- [x] 9.3 Reclaim width: drop the section's own prefix from a token name (the heading already says "Colors"), move the use-count into the name's tooltip, and collapse the drift offer to a single Adopt button in a two-up cell. Full names and values stay in tooltips.
- [x] 9.4 A font-family control spans the full width even inside a two-up section — the picker needs it.
- [x] 9.5 Selecting a preset shows the sample card AS IT WOULD LOOK, computed by projecting the plan onto the project's tokens and re-resolving. The confirm step states scope (how many change, what is added, what cannot be expressed) instead of listing hex values.
- [x] 9.6 A manual edit moves the preview on the keystroke, not after the 400ms write lands; invalid drafts are ignored and drafts clear once the write is saved. The card labels which state it is showing.

## 10. Direct manipulation — show the attribute, not its CSS text

- [x] 10.1 Every section is a grid of visual TILES, not inputs: a filled square for a colour, a shadow cast on a small raised card, a bordered corner for a radius, a to-scale bar for a spacing step, and type set at its own size/family/weight. Reading `0 2px 4px light-dark(oklch(…), oklch(…))` says almost nothing about what that shadow looks like.
- [x] 10.2 Clicking a tile opens its editor as a full-width grid item placed immediately after that tile, so it lands under ITS row — not below the whole section, which on a 100-token palette is nowhere near what was clicked.
- [x] 10.3 A value that cannot be drawn honestly (an alias, `calc()`, an unparseable value) falls back to showing the value as text. Better a plain reading than a picture that misrepresents it.
- [x] 10.4 Remove the +/− steppers, and match the Design Attributes tab's input treatment exactly (surface, size, padding, focus-border) so the two panels read as one app.
- [x] 10.5 A token's VALUE overrules a misleading name: `--border-width: 1px` is a border, not a colour; `--color-shadow: light-dark(…)` is a colour, not a shadow. Both rendered as nonsense (an empty swatch, a colour among box-shadows). Needs a scan-cache version bump, since derivation changed while the input files did not.

## Phase 6 — End-to-end

- [x] 6.1 Manual on AstryxTest: open the Playground; confirm BORDERS lists all four of `--radius-container`, `--radius-card`, `--radius-pill`, `--radius-element`; change one and see the open screen re-render.
- [x] 6.2 Manual on AstryxTest: pick a Google font and confirm the screens render in it; apply Ocean and confirm they re-theme; select Default and confirm Astryx's own values come back.
- [x] 6.3 Full typecheck + test suite across core, ui and both app shells. (1015 core + 148 ui pass; core/ui/ide-web/ide-node typecheck clean. Component tests: the 8 tests for this change all pass. Three CT files fail for reasons that PREDATE this change and were confirmed by stashing the work and re-running on a clean tree: `compose.ct` 16/16, `run-canvas.ct` — which this change actually improves, 15 failures before vs 12 after — and `workbench.ct:76` "Storybook runtime on localhost". A full-suite run that appeared to show more damage was contaminated: it overlapped a second Playwright run competing for the same ports and build cache, and a clean serial re-run of the affected files gives 13 passed / 1 failed, that one being the pre-existing `workbench.ct:76`.)
