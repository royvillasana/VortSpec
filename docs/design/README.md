# VortSpec Design Inspector — design source of record

This directory is the **archived Claude Design handoff bundle** for the Design
System Inspector & Playground (OpenSpec change `add-design-system-inspector`,
PRD v2 §8.7). It is the **visual source of record**: when the Inspector's look
is in question — density, dark palette, mono value specimens, provenance badges,
token swatches, the Tokens / Component Detail / Graph / Issues / History /
Assistant / Projects Dashboard screens — this bundle is authoritative.

It is **not normative for behavior or data.** The bundle was authored for the
deleted **v1** web platform, whose IR-normalization pipeline "inferred" tokens
and assigned provenance/completeness from a canonical store. v2 has **no IR
store**: tokens and components are plain files Claude Code writes into the user's
project (`token_file` / Figma variables, `.sdd-de/components.json`, generated
source under `component_dir`, `specs/*/…` reports). So provenance became
"from Figma variables / from the generated code / hand-edited" (see
`apps/desktop/src/shared/inspector.ts`), not IR inference. Adopt the visuals;
ignore the v1 data model.

## Contents

- `HANDOFF.md` — the original Claude Design coding-agent handoff note (kept
  verbatim for provenance; its "implement this" framing is now **done**).
- `project/` — the `*.dc.html` prototypes (HTML/CSS/JS mockups) plus assets.

## Golden fixture for the future zip-html import adapter

This bundle is also reserved as the **first golden fixture** for the planned
**zip-html import adapter** — the feature that will import a Claude Design
HTML/zip handoff (exactly this shape: a bundle root README + a `project/` of
`.dc.html` files) into a VortSpec project. It is the real, self-referential
dogfood input the bundle's own `HANDOFF.md` calls for.

When that adapter is built, its tests should consume this directory in place
(e.g. reference `docs/design/` from `apps/desktop/src/**/__fixtures__` rather
than duplicating the HTML). Keep the bundle byte-stable so fixture snapshots
stay deterministic; if the design is revised, add a new dated bundle beside it
rather than mutating this one.
