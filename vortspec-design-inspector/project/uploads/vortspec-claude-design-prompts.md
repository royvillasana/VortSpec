# VortSpec: Claude Design Prompt Pack (Phase 1 screens)

How to use: paste the **Session context** once at the start of your Claude Design session.
Then run the screen prompts **one at a time, in order**. Each prompt is scoped to one screen;
refinements go in as short follow-ups, never bundled. After each screen, verify against the
checklist at the end before moving on.

Dogfood note: when the designs are done, export the ZIP from Claude Design and keep it.
That export becomes the first golden fixture for VortSpec's own zip-html adapter (PRD M1).
The product's first imported design will be the product itself.

---

## Session context (paste once)

```
We are designing VortSpec, a professional web platform for design engineers.
VortSpec ingests UI designs from any source (Figma, AI design tool exports),
normalizes them into a canonical token-based representation, and lets users
audit, fix and approve their design system in a Figma-grade inspector.

Audience: design engineers and technical product designers. The app must feel
like a precision engineering instrument: dense, calm, trustworthy. References:
Linear's restraint, Figma's inspector density, Vercel's typographic clarity.
It must NOT look like a generic AI SaaS template (no gradients on cards, no
glassmorphism, no oversized hero illustrations).

Platform: desktop web, 1440px primary, minimum 1280px. Dark UI.

Design tokens for the app itself (use these exact values everywhere):
- bg/base #0B0C0E, bg/panel #141518, bg/raised #1B1D21
- border/subtle #26282D, border/strong #34373D
- text/primary #E7E9EC, text/secondary #9BA1AB, text/muted #6B7280
- accent/primary #7C6FF0 (actions, active states, focus rings)
- Provenance system (used constantly, keep consistent):
  confirmed #30A46C, inferred #FFB224, pending #6B7280, error #E5484D
- radius/md 8px, radius/sm 6px; spacing scale 4/8/12/16/24/32
- Typography: Geist for UI (13px base, 12px dense tables, 15px section titles,
  20px page titles); Geist Mono for token values, hex codes, ids and code.

Recurring components (design once, reuse everywhere):
- Provenance badge: 16px dot + label, colors above (confirmed/inferred/pending)
- Completeness score chip: 0-100 number in a rounded chip, red under 50,
  amber 50-79, green 80+
- Status chip: imported / normalized / approved
- Token swatch: color square 20px with radius/sm, or type specimen "Ag" for
  typography tokens, mono value beside it
```

---

## Screen 1: Projects dashboard

```
Design the Projects dashboard for VortSpec.

Layout: top bar (48px) with VortSpec wordmark left, user avatar right.
Content area: page title "Projects" (20px), primary button "New project"
(accent #7C6FF0) top right of content.

Grid of project cards (3 columns, 16px gap). Each card (bg/panel, border/subtle,
radius/md, 20px padding) shows: project name (15px, text/primary), source icons
row (small Figma glyph and/or ZIP glyph for connected sources), three stat pairs
in a row: "48 tokens", "12 components", "3 approved" (12px mono numbers,
text/secondary labels), and bottom row: completeness score chip + relative
timestamp "Updated 2h ago" (text/muted).

Include realistic project names: "Meridian Design System", "Checkout Redesign",
"PatitasVIP Landing". One card shows an active import: replace stats with a slim
progress bar and the label "Normalizing... stage 4 of 6" in amber #FFB224.

Empty state variant below the fold: centered, icon of a cube being assembled,
title "No projects yet", one line "Import a design from Figma or a ZIP export
to get started", primary button "New project". No illustration bigger than 96px.

On click of a project card: navigates to that project's Inspector.
```

Follow-ups:
1. Add a hover state to project cards: border/strong and a 2px accent left edge.
2. Compact list-view toggle top right, rows instead of cards, same data.

---

## Screen 2: New import flow

```
Design the "New import" screen for VortSpec, shown inside a project.

Centered column, max 640px. Page title "Import a design". Two large source
option cards side by side (bg/panel, radius/md, 24px padding):

Card 1 "Upload a ZIP export": subtitle "Google Stitch, Claude Design, or any
HTML/CSS export". Below it, a dashed dropzone (border/subtle dashed, radius/md,
120px tall) with text "Drop your .zip here or click to browse. Up to 50 MB."

Card 2 "Connect Figma": subtitle "Import published components and variables
from a Figma file". Button "Connect Figma" (secondary style: bg/raised with
border/strong). Under it, muted text: "Optional. You can always start with a
ZIP and connect Figma later."

Below both cards, a collapsed optional section titled "Attach a design system
(optional)" with a chevron. Expanded state: a second smaller dropzone accepting
"tokens.json, CSS variables file, or a second ZIP" and helper text "We will
match extracted values against your official tokens and flag conflicts."

Primary button "Start import" bottom right, disabled until a source is provided.
On click: navigates to the import progress screen.

State variants: dropzone hover (accent border), file attached (filename chip
with a remove x), error state under the dropzone: "We could not find HTML or
CSS inside this file" in #E5484D.
```

Follow-ups:
1. Add a drag-over full-screen overlay state: "Drop to import into Meridian Design System".

---

## Screen 3: Import progress (pipeline view)

```
Design the import progress screen for VortSpec. This screen makes a backend
pipeline feel transparent and trustworthy.

Centered column, max 720px. Title "Importing stitch-export-checkout.zip"
(mono filename), subtitle "Meridian Design System".

Vertical stepper of 6 stages, each a row (bg/panel, radius/md, 12px padding,
8px gap between rows): stage number in mono, stage name, status icon right.
Stages and example states:
1 Parse: done (green check), caption "214 nodes, 3 stylesheets"
2 Style mining: done, caption "1,082 style values collected"
3 Token inference: running (accent spinner), caption "Naming 47 candidates..."
4 Structure inference: queued (muted)
5 Design system merge: queued, caption "tokens.json attached" 
6 Report: queued

Done rows show their caption in text/secondary with a mono count. The running
row has a subtle accent left border. Under the stepper: overall progress bar
and "Stage 3 of 6".

Failure variant of row 3: red icon, caption "AI provider key is invalid.
Deterministic stages completed; token naming is paused." and a small
"Retry stage" ghost button on the row.

Bottom right: secondary button "Continue in background". On completion the
screen transitions to a summary: "48 tokens, 12 components, 31 issues found"
with primary button "Open Inspector".
```

Follow-ups:
1. Design the completion summary as its own state with the three numbers large in mono.

---

## Screen 4: Design Inspector, Tokens panel (hero screen, invest here)

```
Design the Design Inspector for VortSpec, Tokens view. This is the product's
core screen: a Figma-grade audit surface for design tokens.

Three-region layout:
- Left rail 220px (bg/panel, border-right border/subtle): project name top,
  then nav items Tokens (active, accent text + bg/raised pill), Components,
  Issues with a count badge "31", History. Bottom: settings gear.
- Main area (bg/base): tokens table.
- Right side: collapsed chat drawer, shown as a 48px vertical strip with a
  chat icon (it expands in screen 6).

Main area header: title "Tokens", segmented filter (All / Color / Typography /
Spacing / Radius / Shadow), search input, and a filter chip "Inferred only".

Tokens grouped by type with sticky group headers ("Color, 18 tokens").
Each row (44px, border-bottom border/subtle): swatch, token name in mono
(e.g. color/primary/500), resolved value in mono text/secondary (#2563EB),
provenance badge, usage count right-aligned ("14 uses", clickable),
overflow menu (rename, edit value, alias, merge, delete).

Realistic data: color/primary/500 #2563EB confirmed 14 uses;
color/primary/600 #1D4ED8 inferred 6 uses; color/neutral/500 #6B7280 inferred
22 uses; two near-duplicate greys #71717A and #6E7076 both inferred, marked
with a small amber link icon and tooltip "Possible duplicate, review suggested";
radius/md 8px confirmed 19 uses; type/body Geist 14/20 confirmed 31 uses.

Selecting a row opens a 360px detail panel sliding from the right (over the
chat strip): token name editable, type, value editor (color picker for colors),
alias dropdown, provenance line "Inferred by VortSpec from stitch-export.zip",
a Confirm button (turns badge green), and a "Where used" list: component name +
property per row (Button: background, Card: border), each row highlights on hover.

Selection state: row selected with bg/raised and accent left edge.
```

Follow-ups:
1. Design the merge flow as a modal: left column "Merging 3 tokens", right column target token, below a preview list "27 references will be rewritten", confirm button in accent.
2. Empty search result state: "No tokens match" with a clear-filters link.

---

## Screen 5: Design Inspector, Component detail

```
Design the Component detail view inside the VortSpec Inspector (same left rail,
Components item active).

Header: breadcrumb "Components / Button", status chip "normalized" (amber),
completeness score chip "82", and primary button "Approve component" top right
(disabled look with a tooltip if error-level issues exist).

Content in two columns (main 2/3, side 1/3):

Main column, stacked sections:
1 "Variants": a matrix grid rendering the component per combination. Columns =
intent (primary, secondary, ghost), rows = size (sm, md, lg). Each cell shows a
static button preview on bg/raised. Axis labels are editable-looking with an
inferred badge on the "intent" axis and a small "Confirm" ghost button.
2 "Structure": an indented tree (mono, 12px): root frame, then children, each
row with node type icon, name, and any flagged literal shown as an amber chip
"#FFFFFF flagged" with a hover action "Promote to token".
3 "States": rows for hover, disabled; each with a mini preview and provenance badge.

Side column:
1 "Props" card: table name / type / default. Rows: label string required;
disabled boolean false; each with provenance badge.
2 "Issues (2)" card: warning row "Text color #FFFFFF is a raw value" with a
one-click button "Promote to token", and info row "No focus state detected".
3 "Provenance" card: source "stitch-export-checkout.zip", extractor, date.

Approve interaction: on click with only warnings, open a confirm dialog listing
the warnings with the copy "Approve anyway? These issues will remain tracked."
```

Follow-ups:
1. Variant matrix cell hover: shows the variant selector combo as a mono caption.
2. Designs for status transitions: the chip and score animating from normalized/82 to approved/82 with a green check toast "Button approved".

---

## Screen 6: Conversational editing (chat drawer + patch diff)

```
Design the expanded chat drawer of the VortSpec Inspector: conversational
editing with mandatory diff approval. Same Inspector layout as before; the
right drawer is now open at 400px (bg/panel, border-left border/subtle).

Drawer header: "Assistant" with a subtle mono caption "proposes changes,
never applies them without you".

Conversation content, realistic:
- User bubble: "renombra todos los tokens de color al formato semantic/primary/500"
- Assistant reply: one short line "I propose renaming 18 color tokens to the
  semantic format. Review the changes:" followed by a PATCH CARD, the key
  element of this screen:

Patch card (bg/raised, border/strong, radius/md): header row with the summary
"Rename 18 color tokens" and a mono chip "patch". Body: a diff list, each row
with the old name in mono struck-through text/muted and the new name in mono
text/primary with a subtle green tint background, e.g.
  blue-500  ->  color/primary/500
  blue-600  ->  color/primary/600
  gray-100  ->  color/neutral/100
Show 5 rows and a "+13 more" expander. Footer: destructive-neutral button
"Reject" and primary accent button "Apply 18 changes".

Below, show an applied patch from earlier in the conversation: same card
collapsed with a green check and "Applied, v12 -> v13" plus an "Undo" ghost link.

Also design the ambiguity state: user says "haz los botones mas redondeados"
and the assistant replies with a clarifying question and two option chips:
"radius/md 8 -> 12px (affects 4 components)" and "Only the Button component".

Input at the bottom: text field with placeholder "Describe a change in English
or Spanish...", send button.
```

Follow-ups:
1. Loading state of a patch being generated: skeleton card with the caption "Drafting patch...".
2. Error state: "I could not turn that into a safe change" with a retry link, in neutral tone, no red.

---

## Verification checklist per screen

- Provenance badges use the exact four colors, never improvised ones.
- All token names, hex values, ids and filenames are in Geist Mono.
- No gradients, no glass effects, no decorative illustration over 96px.
- Every interactive element has a visible hover or focus treatment.
- Realistic content everywhere; if any "Lorem" or "Feature 1" appears, regenerate.

## Suggested working order

Run screens 4 and 5 first (the Inspector is the product; if its density and
tone land, everything else inherits them), then 6, then 1 to 3. Export the ZIP
when finished and archive it as the adapter's first test fixture.
```

Token estimate: session context ~430 tokens; each screen prompt ~280-420 tokens. All comfortably within a single-message budget for Claude Design; keep follow-ups as separate short messages.
