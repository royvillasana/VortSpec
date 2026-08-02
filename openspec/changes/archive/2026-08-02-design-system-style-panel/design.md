## Context

Two problems meet in the Playground sidebar.

**The design system editor is lever-shaped.** Seven semantic knobs, each mapped to one token per source via
a hard-coded table (`LEVER_TOKENS`). On a real Astryx project "Card radius" wrote `--radius-container` while
the screens rounded cards with `--radius-card`: the knob moved 5 elements and none of the cards. The fix was
a per-lever alias set, then a second fix so that alias set didn't flatten the shadow ramp. Both are
symptoms — the model enumerates what VortSpec knows instead of resolving what the project has, and whole
properties (spacing, typography) have no lever at all.

**The sidebar's own hierarchy is flat.** In `DesignPanel`, `LayersRegion` (the tree) and the selection's
property sections are siblings in one scroll column, so a selection's attributes read as a second list
rather than as the selected layer's detail.

The provided design resolves both, and this document follows it. What it shows:

```
┌─────────────────────────────┐
│ ▸ Pages  (Sitemap)          │   EXISTING region — stays on top
├─────────────────────────────┤
│ LAYERS TREE            [⌕]  │   the designed region starts here
│                             │   fixed top region, own scroll
│  ∨ div                      │
│    ∨ card          ← sel    │
│      ∨ header               │
│      ∨ footer               │
│        ≡ text-label         │
├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┤   ← resize handle
│ [Design Attributes] Library │   tab bar, one active
├─────────────────────────────┤
│ (tab body)                  │
└─────────────────────────────┘
```

- **Design Attributes** shows the SELECTED node: name + dimensions, then its property sections. Selecting a
  different layer refills it (the design shows `card 1280 × 720`, then `header 240 × 48`).
- **Library** shows the DESIGN SYSTEM, independent of selection: a Live Preview ("reflects token values"),
  a Manual · Presets mode switch, and in Manual the sections COLORS, TYPOGRAPHY, SPACING, BORDERS, SHADOWS.
  In Presets, named themes with one ACTIVE, plus "Create New Preset" and "Import Preset".

Reused wholesale: the durable overlay (`.vortspec/theme-overrides.json`) with its consume guard, `@import`
resolution of the token file, overlay-aware token reads, `light-dark()` light-half editing, and the
screens→design-system drift reader.

## Goals / Non-Goals

**Goals:**
- The sidebar shape above, exactly: resizable tree over a two-tab region.
- Library as specified: live preview, Manual/Presets, the five sections.
- Every token the project actually has is reachable — no property or token stranded because VortSpec has no
  name for it.
- The Library editor available in the Playground AND the Design-tokens sidebar, from one implementation.

**Non-Goals:**
- **Redesigning the attribute controls.** The mock's Geometry / Auto Layout / Fill & Stroke fields are
  illustrative only. Design Attributes keeps today's property sections verbatim; only its container changes.
- Authoring or renaming tokens — that stays the Tokens tab.
- Component variants or structure; only style VALUES.
- Per-INSTANCE styling — that is what Design Attributes already does.

## Decisions

### D1. Two regions, tabs — not collapsible siblings, not nested in the tree
A previous revision of this plan proposed three collapsible sections with the attributes nested under the
selected tree node. The design says otherwise and the design is right: the tree stays a stable navigator
with its own scroll, and the detail area below it is **tabbed**, because Design Attributes and Library are
alternative uses of the same space rather than things to see at once.

Nesting attributes inside the tree is explicitly rejected: with a deep tree the editor would sit at an
arbitrary depth and scroll position, and indentation would imply the attributes are a child *node* rather
than that node's detail.

The boundary is a **resize handle** (the design draws one), so the user trades tree height against detail
height. `LayersRegion`'s current fixed `max-h-44` becomes that resizable height.

### D2. Design Attributes is today's panel, re-parented
The tab body is the existing `SelectionHeader` + `VariantSection` + `PropertySection`s, moved as-is. The one
addition from the design's header row is the selected node's **dimensions** beside its name. No control is
redesigned, added, or removed — that keeps this change about STRUCTURE and leaves the per-selection editing
model (already specified under `visual-token-editing`) untouched.

### D3. A section's rows are the PROJECT's tokens, grouped — no canonical row list
The design draws canonical rows (Primary / Secondary / Tertiary / Background / Surface; H1…Caption; xs…xl).
Read literally that is the lever model with more rows, and it would strand `--radius-card` and
`--radius-pill` exactly as "Card radius" did. The roles a project has are its own, so the rows follow the
project: every token whose type belongs to a section is a row in that section, in the project's own naming.

Sections map to the token `type` the parser already assigns (`color | typography | spacing | radius |
shadow`), so the grouping needs no new taxonomy and no per-library table. `other`-typed tokens stay in the
Tokens tab.

On the Astryx project BORDERS therefore lists `--radius-container`, `--radius-card`, `--radius-pill` and
`--radius-element` — all four editable, which is precisely what the lever model could not do.

**Role resolution does not disappear — it moves to presets only.** A built-in preset is authored against
roles (primary, body font, card radius…), so applying it must map those roles onto THIS project's tokens.
Confining role resolution to the apply path means a mis-resolved role can affect a preset application, never
the panel's ability to show and edit a token.

### D4. Writes are the existing overlay calls
Editing any row → `setThemeTokenOverride(token, value)`. Unchanged path, unchanged consume guard, and the
live re-theme comes along. Nothing new is invented for the Library tab's edits.

### D5. Default is not a preset — it is the source design system
The list's first entry is not a preset at all. **Default IS the design system the project already has**,
straight from its source: the consumed library's own values (Astryx's, MUI's) or, for a Figma project, the
design system in the Figma file. There is nothing stored for it — no definition, no authored values.

**Ocean**, **Forest** and **Sunset** ship with VortSpec as fixed, read-only definitions.

Selecting **Default** therefore means "show me my source design system again": the preset's values are
removed and the source's own values are in effect. For that to be precise rather than destructive, the
overlay records which entries a preset wrote:

- A preset apply writes its entries **preset-owned**.
- A user edit in Manual mode writes **user-owned** — including an edit to a token a preset had written,
  which transfers that token to the user (they have taken it over).
- Selecting Default removes only the preset-owned entries, so the user's own personalization survives while
  the preset's contribution is undone.

**Editing after applying a built-in edits the PROJECT, not the preset**: a built-in is a starting point,
never a live binding. A user who applies Ocean and then darkens its primary has an Ocean-derived project —
Ocean's definition is untouched and stays available to re-apply here or in another project.

*Consequence to state plainly in the UI:* switching from one PRESET to another overwrites the tokens the
outgoing preset owns. That is why the change is previewed before it is applied (D5b).

### D5a. A preset may INTRODUCE a role the project lacks
A project consuming a library with no type scale has no `H1…Caption` tokens at all. Rather than hide
typography or invent tokens silently, a preset carries the scale and its application CREATES those tokens in
the overlay — the same mechanism that already lets the overlay hold `--radius-card` on a library that has no
such token. So "this project has no caption size" is answered by applying a preset that defines one, and the
user is told that is what happened.

Tokens introduced this way are ordinary overlay entries: editable in Manual mode afterwards, and never
written into the vendor's files.

### D5b. Preset apply is previewed, and partial application is reported
One click can rewrite many tokens. Before applying, the panel shows what will change: which tokens take a
new value, which roles will be newly introduced, and which roles this project cannot express and will be
skipped. After applying, the skipped roles are reported rather than silently dropped.

### D5c. The built-in definitions
Authored against roles, with light/dark pairs so a project whose tokens are `light-dark()` keeps both modes
(reusing `applyLightDark`). Summary lines match the design's.

| Role | Ocean — SF Pro · Blue · 4px | Forest — Poppins · Earth · 12px | Sunset — Montserrat · Coral · 6px |
|---|---|---|---|
| primary | `#0A84FF` / `#4DA3FF` | `#2E7D5B` / `#5FA882` | `#FF6B4A` / `#FF8A6E` |
| secondary | `#5AC8FA` / `#7FD8FB` | `#8AA86B` / `#A8C089` | `#FFA24C` / `#FFB877` |
| tertiary | `#64D2FF` / `#8ADEFF` | `#C7A15A` / `#D8BA82` | `#FF4D6D` / `#FF7A93` |
| background | `#F5F9FC` / `#0B1620` | `#F7F8F3` / `#12170F` | `#FFF7F4` / `#1A1013` |
| surface | `#FFFFFF` / `#12222E` | `#FFFFFF` / `#1B2318` | `#FFFFFF` / `#241619` |
| font family | `"SF Pro Text", -apple-system, system-ui, sans-serif` | `Poppins, "Segoe UI", system-ui, sans-serif` | `Montserrat, "Helvetica Neue", system-ui, sans-serif` |
| radius | `4px` | `12px` | `6px` |
| type scale | 32 / 24 / 20 / 16 / 14 / 12 | 32 / 24 / 20 / 16 / 14 / 12 | 32 / 24 / 20 / 16 / 14 / 12 |
| spacing | 4 / 8 / 16 / 24 / 32 | 4 / 8 / 16 / 24 / 32 | 4 / 8 / 16 / 24 / 32 |
| shadow | `0 4px 12px rgba(0,0,0,.12)` | `0 4px 12px rgba(0,0,0,.10)` | `0 4px 12px rgba(0,0,0,.12)` |

Values are the starting point, to be tuned against the Live Preview during implementation. Font families
ship as **stacks ending in `system-ui, sans-serif`** so a failed or blocked font load degrades instead of
breaking — but a named family is now genuinely loadable, see D5d.

### D5d. The font family is CHOSEN from four sources, and a chosen font is actually loaded
Typography's font family is a picker, not a free-text field, offering:

1. **The library's fonts** — the families already named by the project's own `--font-family-*` tokens.
2. **System fonts** — families installed on the user's machine.
3. **The Figma file's fonts** — families used by the connected Figma file's text styles, so code can match
   the design without retyping a name.
4. **Google Fonts** — the catalog, searchable, so the user can change the type without installing anything.

Sources are labelled in the picker, because "installed here" and "will be fetched" have very different
consequences for anyone else opening the project.

**A chosen font must actually render**, in three places: the panel's Live Preview, the served light pages,
and generated framework code. A Google family is therefore recorded on the design system (family + the
weights in use) and the light-page serve path emits its stylesheet link alongside the token CSS it already
injects — the same seam that makes an overlay edit show up on an open screen. Generated code carries the
same link so the built app matches the preview.

*Alternative rejected:* free-text font names. It is what exists today by accident, and it silently produces
a fallback whenever the name isn't resolvable — the failure mode the user hits without ever being told.

**Google catalog: bundled head, fetched tail.** A curated ~70-family snapshot ships with the app, so the
picker is instant and works offline and covers what almost everyone picks. When the user scrolls past the
end of it (or searches beyond it), the remaining catalog is fetched once and appended. Neither pure option
was right: bundling all ~1500 families bloats the app and goes stale, while fetching everything makes the
common case need a network.

**System fonts via `queryLocalFonts()`.** Chromium's Local Font Access API gives real family names from one
implementation instead of three platform shell-outs. It needs the `local-fonts` permission, which the shell
grants for its own renderer — the user is explicitly asking for their system fonts in a font picker, and
prompting for it inside our own app would be noise. If the API or permission is unavailable the source
returns empty and the other three still work.

**Figma fonts are labelled as Figma's.** A family offered because the connected Figma file uses it is marked
as such — that is exactly the information that makes it worth picking (it matches the design), so the label
is the point, not decoration. Absent for a project with no Figma source.

### D5e. The tree header's search filters layers by name
The `⌕` on the LAYERS TREE header is a filter: typing `footer` narrows the tree to matching nodes so the
user can select one directly instead of scrolling and expanding. It exists because a real screen's tree is
long — the AstryxTest page carries dozens of nodes — and hunting for one is the slowest part of editing it.
Matching is on the node's name, case-insensitive, keeping ancestors visible so the match's position in the
hierarchy stays readable.

### D6. Live Preview is a self-contained sample, not the real screens
The design's preview is a small sample card that "reflects token values" — it answers "what do these values
look like together" without a screen open. It renders from the currently resolved values only. It is NOT a
substitute for the real screens beside the canvas, which update through the existing overlay injection.

### D7. One implementation, two mounts — and they must not go stale
The Library panel takes `{ project, onEdited }` and nothing surface-specific, and is mounted both as the
Playground sidebar's Library tab and in the Design-tokens sidebar (replacing the lever editor there).

Replication introduces a failure mode a single panel never had: both can be mounted at once, so an edit on
one leaves the other showing a value that is no longer true — and still editable, so the next click there
writes back a superseded value. Both therefore re-read after any local edit and on the workspace-watcher
event for the overlay file. The watcher is already reference-counted, so two subscribers are safe. This is
a correctness requirement of replicating, not a nicety.

### D8. The lever model is deleted, not deprecated
`DesignSystemLever`, `LEVERS`, `LEVER_TOKENS`, the alias sets and `designSystem:levers` go — keeping them
would mean maintaining two competing models of the same design system. The pure helpers bundled with them
(`parseLightDark`, `applyLightDark`, `swatchHex`, `controlFor`, `isValidLeverValue`, `sameDesignValue`) are
property-level utilities and stay.

### D9. Drift moves onto the row
The screens→design-system proposal ("your screens use a different value") survives, but appears on the
affected row inside its section rather than as a banner — where the user is already looking.

## Risks / Trade-offs

- **Role resolution is the lever problem in miniature** → a preset role mapped to the wrong token writes the
  wrong value. Mitigate: resolution is confined to the APPLY path (D3), so a bad mapping can never stop a
  token being shown or edited; a role resolves only to a token the project genuinely has; and the apply is
  previewed before it runs (D5b).
- **A chosen font may not load** → a system family isn't installed for the next person to open the project,
  or a Google font is blocked offline. Mitigate: every family is a STACK ending in `system-ui, sans-serif`
  so it degrades rather than breaks; the picker labels each family's source; and the panel says when the
  chosen family did not resolve, instead of leaving the user wondering why type looks unchanged.
- **Google Fonts adds a network dependency to a served page** → light pages are otherwise self-contained,
  and a blocked fetch means the preview silently differs from what the user picked. Mitigate: the font link
  is emitted only when a Google family is actually chosen, the fallback stack keeps the page readable, and
  the non-resolution warning above covers the silent case.
- **Enumerating system fonts is platform-specific** → there is no portable Electron API. Mitigate: treat it
  as its own task with a per-platform path and a graceful empty result, so the other three sources still
  work if enumeration fails.
- **A preset can force a colour scheme** → a preset that sets background/surface could drag a light project
  dark. Mitigate: built-ins carry light/dark pairs and are applied through `applyLightDark`, so a project
  whose tokens are `light-dark()` keeps both modes rather than being flattened to one.
- **Switching presets overwrites edits made after the last apply** → the user can lose deliberate tweaks.
  Mitigate: the apply preview names exactly which tokens change and to what, before anything is written;
  every write is an ordinary overlay entry, so any single one can be edited back.
- **Two tabs hide half the panel** → the user loses sight of attributes while in Library. Mitigate: it is
  the design's intent (they are alternative uses of the space); the tab choice persists per project so the
  user isn't re-selecting it constantly.
- **Preset portability across projects** → roles that don't resolve are skipped, so a preset can land
  partially. Mitigate: report exactly which roles applied and which were skipped, never silently half-apply.
- **A preset introducing tokens grows the design system** → applying a type scale to a project that had none
  adds tokens the library does not define. Mitigate: this is deliberate (D5a) and stated at apply time; the
  tokens are ordinary overlay entries, editable and removable, and the vendor's files are untouched.
- **Two mounted instances disagreeing** → covered by D7 and tested with both mounted.
- **Deleting the lever model touches an unarchived change** → archive `design-system-token-editor` first
  (see Migration).
- **The resizable tree changes a stable layout** → users relying on today's fixed tree height see it move.
  Mitigate: persist the height per project and default to today's.

## Migration Plan

1. Archive `design-system-token-editor` so its shipped foundations (overlay writes + consume guard,
   `@import` resolution, `light-dark()` handling, screen drift, live refresh) land in the main specs.
2. Restructure the sidebar shell (tree + resizer + tab bar) and move the existing property sections into the
   Design Attributes tab — a pure re-parenting, verifiable on its own with no behavior change.
3. Build the property-grouped reader and the Library tab's Manual mode; mount it as the Library tab.
4. Add Presets on top of the resolved roles.
5. Swap the Design-tokens sidebar's mount from the lever editor to the same Library panel, then delete the
   lever module, its IPC channel and its tests in one commit.

No data migration: values written by the lever editor are ordinary durable-overlay entries and read back
unchanged.

## Implementation notes (recorded during the build)

- **`local-fonts` permission NOT granted.** The plan had the shell grant it so `queryLocalFonts()` runs
  unprompted. It was not implemented: installing `setPermissionRequestHandler` flips Electron's default for
  EVERY permission from grant-most to deny-most, which would silently break clipboard, media and more. The
  picker falls back to a curated system list, and the other three sources are unaffected — a far better
  trade than a permissions regression.
- **`-apple-system` must not be quoted.** A bare CSS identifier may start with a hyphen; quoting it makes it
  a literal family name that does not exist, so the fallback it was meant to provide silently stops working.
  Caught by a test, fixed in `fontStack`.
- **Astryx's spacing scale is in `@astryxdesign/core`, not the theme package.** Provisioning imported only
  the theme, so the Spacing section read empty on a real Astryx project. Fixed in the provisioning guidance;
  projects created before that still need the extra `@import` added to their token file.

## Open Questions

None outstanding — the scope, the Google-catalog strategy, system-font enumeration, Figma-font labelling and
the meaning of Default are all decided above. Anything that surfaces during implementation is recorded here.
