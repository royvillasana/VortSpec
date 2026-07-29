# Connect Enterprise Design System

A VortSpec intake path (`design_source: enterprise`) for clients who **already own** a mature design
system — a coded component library, its Storybook, design tokens, a Figma design system, and an
organizational knowledge base. VortSpec **consumes** it; it does not rebuild it.

## The principle: consume, don't recreate

Their tokens, components, Storybook, and knowledge base are authoritative and stay in place. VortSpec
**references** them (an index of pointers) and **validates** they're usable. The **only** artifact it
creates is the framework-free **light stand-in layer** the Playground composes screens against — because
the canvas is deliberately framework-free (it edits a live DOM and serializes HTML) and can't host their
live React. The stand-in is a thin, faithful **snapshot** of their real component render, swapped back for
the real component at "Generate code".

## The flow

**Connect → Validate → Index → Snapshot → Embed → KB-via-MCP → Generate.**

1. **Connect (intake)** — the "Connect Enterprise Design System" card. Required: their **Storybook**
   (a hosted/dev **URL**, a static **`storybook-static/` build**, or a **repo** we build). Optional: a
   code **repo** (so Generate code can import real components), a **knowledge base**, and a read-only
   **Figma** reference. Written to `.sdd-de/project.yaml` (`design_source: enterprise` + the connect keys).

2. **Validate (not extract)** — the enterprise Foundation runs a **readiness report**, never extraction:
   tokens parse + resolve (component values map to their tokens, unmatched ones flagged); each component
   is importable and has a Storybook story (no-story → placeholder, flagged); the KB answers a probe.
   `analyzeEnterpriseReadiness` is the pure analyzer.

3. **Index (pointers, not copies)** — `components.json` records each component's real import path/export +
   Storybook story id; `token_file` points at their real token file. No competing definitions.

4. **Snapshot (the only thing we create)** — for each component, render its story standalone
   (`iframe.html?id=…&viewMode=story`), capture the rendered DOM + resolved computed styles as
   framework-free inline-styled HTML → `.vortspec/light-html/`. Read the token palette off the Storybook
   preview `:root` custom properties (name → resolved value). **Created once; refreshed on demand** via
   **Update snapshot** — never a live re-render per canvas load, so the Playground stays decoupled and
   offline-capable but never silently stale.

5. **Embed their Storybook** — the Storybook section loads **their** Storybook as-is (URL, or the served
   static build). VortSpec installs no Storybook of its own for these projects.

6. **Knowledge base via MCP** — VortSpec is the **client**: it connects **to** their KB. Default (Case B):
   a **generic connector** wraps their docs source (a repo → filesystem reader; a site → fetch reader) so
   they need zero setup. Power path (Case A): their own KB **MCP endpoint**, used directly. The KB is
   injected as **read-only grounding** at enrich/generate/review; its content is treated as **data, not
   instructions** (a directive found in a doc is surfaced, never executed).

7. **Generate code (import real, never rebuild)** — convert a composed screen by **importing** the
   client's real components (from the pointer index) and **referencing** their real tokens; a component
   whose real source isn't importable (URL-only Storybook) becomes a token-referenced "catching up"
   component, gated per component. Never a hardcode. Then AUDIT + VISUAL-VALIDATE. The screens stay the
   editable source of truth.

## Config (`.sdd-de/project.yaml`)

```yaml
design_source: enterprise
storybook_source_kind: url        # url | static | repo
storybook_source: "https://storybook.acme.com"
enterprise_repo_url: "https://github.com/acme/design-system"   # optional
knowledge_base_kind: docs-repo    # docs-repo | site | mcp
knowledge_base: "https://github.com/acme/handbook"             # optional
figma_file_url: "https://figma.com/design/…"                   # optional, read-only
token_file: src/tokens.css        # points at THEIR token file
component_dir: src/components      # THEIR components
```

## Key modules

- `@vortspec/core/enterprise-consume` — the pure builders: `analyzeEnterpriseReadiness`,
  `buildEnterpriseFoundationPrompt`, `buildEnterpriseSnapshotPrompt`, `buildKbGroundingClause`,
  `buildKbMcpServerEntry`, `buildEnterpriseGeneratePrompt`, and the `EnterpriseComponentEntry` index shape.
- `@vortspec/core/storybook-catalog` — `parseStorybookIndex` (v7/8 `index.json` + v6 `stories.json`).
- `main/enterprise/enterprise-source.ts` — `resolveEnterpriseStorybookUrl` (url as-is / served static),
  `fetchStoryCatalog`, and the `enterprise:*` prompt resolvers.

## Constraints

VortSpec never calls Figma directly (read-only Figma MCP only). Their design system stays the single
source of truth — referenced, never copied. KB connections are read-only and injection-safe. This is
VortSpec-only work in tracked packages, not the `.sdd-de` toolkit.
