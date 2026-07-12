# Storybook sync & proper Google-format DESIGN.md

## Why

Investigating a real project (`sdd based test`, 34 components) surfaced three
concrete defects:

1. **New components don't reach Storybook.** Only the 11 first-batch components have
   `.stories.tsx`; the 23 added later have source but no story, so Storybook can't
   show them. The app generates stories once at Storybook setup and never again as
   the design system grows.
2. **DESIGN.md is not the Google format.** The file present is the `/sync-tokens`
   token-decisions log — `npx @google/design.md lint` fails with *"No YAML content
   found."* It's stale (11 components) with no usage examples or Storybook links.
3. **Root cause — a filename collision.** `/sync-tokens` writes `design.md` and
   `/design-doc` writes `DESIGN.md`; on macOS (case-insensitive FS) these are the
   **same file** (confirmed identical inode), so they clobber each other and the
   decisions log wins.

The methodology (`design-doc` skill) is actually correct — it authors the Google
format with per-component usage + Storybook links and validates with the Google
CLI. The failures are in how the **app** drives it. Per the user's direction, we
patch this in the app's prompts only, not the SDD-DE methodology.

## What Changes

- **A — Storybook sync.** The story-generation prompt becomes additive/idempotent:
  it generates a story only for components that don't already have one and never
  overwrites existing stories. The Playground action re-runs it to cover newly-built
  components ("Sync stories — N missing").
- **B — Regenerate the proper DESIGN.md.** The manifest "Generate" prompt runs
  `/design-doc` to produce the Google-format `DESIGN.md` (all components, usage
  examples, Storybook URLs) and validates with `npx @google/design.md lint` (0
  errors) — confirming YAML frontmatter is present.
- **C — Fix the collision in the app prompt.** Before generating, relocate any
  existing token-decisions log at the root to `.sdd-de/design-decisions.md` (a
  collision-free name), freeing `DESIGN.md` for the Google format. Redirect the
  app's `/sync-tokens` stage to write the decisions log to that same path so it
  never recurs.
- **Integrate the decisions log as context.** `/design-doc` reads
  `.sdd-de/design-decisions.md` and folds its deviations/decisions into the DESIGN.md
  "Design Decisions" prose section.
- **D — Spec-clean output.** Keep the `components:` frontmatter to Google-valid
  properties only; put source/variants/Storybook/usage in the `## Components` prose
  so `lint` is warning-free.
- **Validation surface.** The manifest reader detects the file's format (`google` /
  `decisions-log` / `empty`); the Design Manifest screen warns when it isn't the
  proper Google format and offers to regenerate — so the collision fix is visibly
  verified.

## Impact

- Prompts: `views/DesignManifest.tsx` (GENERATE_PROMPT), `views/DevPreview.tsx`
  (STORYBOOK_PROMPT + action), `shared/flow.ts` (sync-tokens target).
- Data: `shared/manifest.ts` (+`format`), `main/manifest/manifest-reader.ts`
  (format detection). No change to SDD-DE skills — Claude Code still executes them.
