# Task 9.4 — End-to-end acceptance checklist

Open the Inspector on a **real generated project**, browse all tokens +
components, render Button in the Playground, run the gated modify loop once, and
confirm `pnpm build && pnpm test && pnpm lint` are green.

Two kinds of steps below:

- **[auto]** — machine-verifiable; already checked here against the real project
  (results filled in). Re-runnable without launching the app or spending usage.
- **[manual]** — needs a human at the running app; a few spend the user's Claude
  usage (flagged ⚠️) and so are **not** automated.

## Fixture project

`/Users/royvillasana/Desktop/Roy Villasana/Proyectos/sdd based test`
— React + TypeScript + Tailwind; `design_source: figma`;
`token_file: src/styles/tokens.css`; `component_dir: src/components`.

This is a genuine SDD-DE output (11 components, a real token file, spec reports),
so it exercises the file-derived readers the way a user's project would. It is a
better 9.4 target than the `docs/design/` golden fixture (which is HTML mockups,
not a generated code project).

## A. Command gate  [auto] ✅

Run at repo root:

```bash
pnpm build && pnpm test && pnpm lint
```

Verified green: build (turbo) ✓, 68 Vitest unit tests ✓, lint ✓.
Renderer component tests: `pnpm test:ct` → 11 Playwright CT ✓ (tasks 9.2/9.3).

## B. Data layer over the real project  [auto] ✅

The Inspector/Playground render exactly what the main-process readers return.
Ran `getInspectorTokens` / `getInspectorComponents` / `getVerification` against
the fixture project; these are the values the UI must show:

- **Tokens** — `tokenFile: src/styles/tokens.css`, **45 tokens**: color 21,
  typography 12, spacing 9, radius 2, other 1. `figmaSynced: false` (no export
  yet → no drift badges until a sync runs), `figmaOnly: 0`, `drifted: 0`.
- **Components** — `componentDir: src/components`, **11 components**, all 11 with
  resolved source. Status: 9 `built`, 2 `has-issues`. Names: Icon, IconWrapper,
  Text, Paragraph, Button, Logo, Title, PageTitle, Callout, CodeBlock, Header.
- **Button** — `src/components/ui/Button.tsx`; 4 source-derived props:
  `variant` (enum: base | primary | secondary | success | danger | warning |
  info | light | dark | link), `size` (enum: small | medium | large),
  `outline` (boolean), `iconOnly` (boolean). Tokens consumed via `var()` scan: 0
  (this project styles with Tailwind utilities, so the panel shows the
  "uses token utilities; var() scan found none" note — expected, not a bug). No
  `spec.md` / visual-verify report yet → Source & spec links show
  "not created yet". Status `built`.
- **Verification** — 7 findings parsed from `specs/*/…` reports.

## C. Interactive UI walkthrough  [manual]

Launch: `pnpm --filter @vortspec/desktop dev`, then open the fixture project
(Dashboard → the `sdd based test` project, or "Open project" → its folder).

- [ ] **Open the Inspector.** From the project view, open **Tokens**. Expect the
      grouped list with **45** tokens and the header showing `src/styles/tokens.css`.
- [ ] **Browse all tokens.** Segments switch Color(21)/Typography(12)/Spacing(9)/
      Radius(2)/Other(1). Search filters live. Selecting a token opens the detail
      drawer with the swatch/specimen, value editor, source line, and where-used.
- [ ] **Browse all components.** Open **Preview** (Playground). The picker lists
      all **11** components grouped by level (atoms/molecules/…), each with a
      status dot (2 amber "has-issues", the rest neutral "built").
- [ ] **Render Button in the Playground.** Select **Button**. Controls show the 4
      props; the `variant` select has 10 options and `size` has 3; `outline` /
      `iconOnly` are toggles. "Source & spec" links the component source (spec /
      report show "not created yet"). Changing a prop updates the code snippet.
      If the project has no live dev-server surface, use **Generate harness**,
      then the embedded preview renders the gallery and reacts to prop changes.
- [ ] ⚠️ **Gated modify loop once (spends Claude usage).** In Button's controls,
      open **Modify with Claude**, request a small change (e.g. "tighten the
      medium size's horizontal padding"). Confirm: the tabbed run panel streams
      progress, the change is applied, the preview updates, and a **Keep / Revert**
      bar appears. Click **Revert** → `Button.tsx` (+ its `.variants` sibling) is
      restored verbatim. Optionally re-run and **Keep** to confirm persistence.
- [ ] **(Optional) Figma reconciliation.** With the Figma Desktop Bridge
      connected (`design_source: figma` here), click **Sync from Figma**; on
      completion tokens show `figma-variable` provenance, in-sync/drifted pills,
      and the reconciliation banner. Without the bridge, the button reads
      "Connect Figma to reconcile" (gated) — verify that state too.

## Sign-off

- Automated (A + B): **passing** as of this change.
- Interactive (C): to be signed off by a human against the running app; the
  ⚠️ step is the only one that consumes Claude usage.
