# Design — Storybook sync & Google-format DESIGN.md

## Constraint

Patch the **app prompts only**; do not touch the SDD-DE skills. Claude Code still
executes `/storybook`, `/design-doc`, `/sync-tokens` — we change the instructions
we send and where the app expects files, plus add a validation surface.

## A — Additive Storybook

`STORYBOOK_PROMPT` (DevPreview) is reworded to: set up Storybook if absent, then
scan `component_dir` and generate a `.stories.tsx` **only for components that don't
already have one**, never overwriting existing stories. It's safe to re-run, so the
Playground action doubles as "sync stories for newly-built components." Label adapts
(setup vs. sync) based on `previewInfo.hasStorybook`.

## B/C/D — DESIGN.md generation

`GENERATE_PROMPT` (DesignManifest) becomes a guarded sequence:

1. **Relocate the decisions log (C).** If the root `DESIGN.md`/`design.md` is a
   token-decisions log — detected by the *absence* of `@google/design.md` YAML
   frontmatter — move it to `.sdd-de/design-decisions.md`. This frees the root name
   (on macOS `DESIGN.md` and `design.md` are the same inode) for the Google format.
2. **Generate (B).** Run `/design-doc` to write the Google-format `DESIGN.md`
   covering every built component, reading `.sdd-de/design-decisions.md` as the
   deviations/decisions context and folding it into the "Design Decisions" prose.
3. **Spec-clean (D).** Keep `components:` frontmatter to Google-valid props
   (backgroundColor/textColor/typography/rounded/padding/size/height/width); put
   source/variants/Storybook/spec/import/usage in the `## Components` prose.
4. **Validate.** `npx @google/design.md lint DESIGN.md` → resolve errors; confirm the
   file opens with `---` frontmatter.

Recurrence prevention: the app's `sync` stage prompt (`shared/flow.ts`) is redirected
to write the decisions log to `.sdd-de/design-decisions.md`.

## Validation surface

`manifest-reader.detectFormat(content)` → `"google" | "decisions-log" | "empty"`:
`empty` if blank; `google` if it starts with a `---` frontmatter block containing any
design-token key (`colors:`/`typography:`/`components:`/`rounded:`/`spacing:`);
`decisions-log` otherwise. `ManifestResult.format` (optional) carries it to the
renderer. The Design Manifest screen shows a warning card + Regenerate when the format
isn't `google`, and a subtle "Google format ✓ (lint-clean target)" when it is — so the
collision fix is visibly confirmed after regenerating.

## Why detection by frontmatter (not by running lint in the reader)

The reader must stay synchronous/cheap and offline; a frontmatter check is a faithful
proxy for "is this the Google format" (the exact thing lint's "No YAML content" error
keys on) without spawning the CLI on every read. The authoritative lint still runs
inside the generation prompt.

## Invariants honored

Claude Code executes every skill; same methodology; local-first (files in the
project); the decisions log is preserved, not discarded; no SDD-DE skill edits.
