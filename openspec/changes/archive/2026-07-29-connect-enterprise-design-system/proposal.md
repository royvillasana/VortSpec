## Why

Enterprise clients already own a complete, authoritative design system — their own design tokens, a coded React component library, a Storybook of those components, their own Figma design system, and an organizational knowledge base for how they work and how they use the system. VortSpec's current intake assumes it will **build** the design system (extract from Figma and run the 7-step cycle, or provision a *known* library like shadcn/MUI). For these clients that is redundant and, worse, a drift risk: the moment VortSpec copies their tokens or rebuilds their components, it owns a fork that rots away from the source of truth. This enterprise case is expected to be common, so it needs a first-class intake path that **consumes** the existing system rather than recreating it.

## What Changes

- **New intake path "Connect Enterprise Design System"** (`design_source: enterprise`) in the project setup stepper, alongside `figma | library | github | zip`. The client points VortSpec at their existing systems — Storybook, code repo (optional), knowledge base, Figma (optional, read-only) — instead of a source to extract.
- **Consume/reference, never recreate.** Their tokens, components, Storybook, and KB stay authoritative and in place. VortSpec's `components.json` and `token_file` become an **index of pointers** to the real assets, not regenerated definitions.
- **Validation replaces extraction.** Connecting produces a **readiness report** (tokens resolve, every component has a story, KB reachable) — confirming the existing system is present and usable for our work — not a rebuilt library.
- **The only artifact VortSpec creates is the light layer.** It snapshots the client's Storybook renders into framework-free "light" stand-ins so the Playground can compose screens (the canvas is deliberately framework-free and cannot host their live React). The snapshot is created **once** and **refreshed on demand** via an explicit "Update snapshot" action — never a live re-render per canvas load, so the Playground stays decoupled and offline-capable but never silently stale.
- **The Storybook section shows THEIR Storybook, as-is.** For an enterprise project the embedded Storybook view loads *their* Storybook (dev URL / hosted URL / served static build). VortSpec does **not** install its own Storybook for these projects.
- **Knowledge base via MCP, VortSpec as the client.** Default (Case B): VortSpec ships a **generic connector** that wraps their KB source (docs repo / wiki / site / Notion-Confluence-Drive), so the client needs zero setup. Power path (Case A): connect to the client's own KB MCP server. Either way the KB is injected as read-only **grounding** at enrich-brief, generate-artifacts, generation, and adversarial-review, treated as data (not instructions) for injection safety.
- **Generate code reuses, never rebuilds.** Compiling a composed screen imports the client's real components and references their real tokens; the token-fidelity resolver guarantees every value binds to a real token, never a hardcode.

## Capabilities

### New Capabilities
- `enterprise-design-system-intake`: the "Connect Enterprise Design System" intake path (`design_source: enterprise`) — the connect fields (Storybook / repo / KB / Figma), the consume-not-copy index model, and the enterprise Generate-code path that imports the client's real components + tokens.
- `design-system-readiness`: the validate-not-extract step — a per-asset readiness report (tokens resolve via the resolver; every component has a story; KB reachable) that confirms the existing system is usable, plus the pointer index (`components.json` / `token_file` → the real assets).
- `storybook-consumption`: consuming the client's Storybook — embedding it as-is in the Storybook section, and the one-time snapshot of its renders into framework-free light stand-ins with an on-demand "Update snapshot" refresh.
- `knowledge-base-mcp`: connecting the client's knowledge base as read-only MCP grounding — the default generic connector (Case B), the bring-your-own MCP server power path (Case A), the grounding-injection points, and the injection-safety guardrails.

### Modified Capabilities
<!-- No existing openspec spec's requirements change; the light-pages/Playground and Figma-MCP behaviors are reused as-is, extended only through the new capabilities above. -->

## Impact

- **Intake / setup**: `ProjectSetup` (the stepper) gains the enterprise card + connect fields; `buildProjectYaml` / project config gains `design_source: enterprise` and the connect settings (Storybook source, KB source/endpoint).
- **Foundation flow**: for `enterprise` projects the Foundation runs **validate + index + snapshot** instead of Figma extraction + component build; VortSpec's own `/storybook` install is skipped.
- **Reused code (not rebuilt)**: `harvest.ts` (Storybook render → framework-free stand-in), the light-design-system (`designer.md`, `light-html` stand-ins, palette), `components.json` as an index, the token resolver + `resolveComponentBindings` (token-fidelity), the `RunApp` Storybook view (embed URL + `StorybookSidebar`), and the agent `mcpConfigPath` / `ide-mcp` plumbing.
- **New surfaces**: a readiness report, an "Update snapshot" action, a generic KB MCP connector, and enterprise-aware Storybook + Generate-code paths.
- **Constraints**: VortSpec never calls Figma directly (read-only Figma MCP only); the client's design system stays the single source of truth; KB connections are read-only and injection-safe. VortSpec-only work in tracked packages — not the `.sdd-de` toolkit.
