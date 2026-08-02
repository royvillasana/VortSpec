## MODIFIED Requirements

### Requirement: Design source input matching the CLI

VortSpec SHALL accept the design source exactly as the SDD-DE CLI supports: a Figma link (resolved through the user's configured Figma MCP in Claude Code), a ZIP export (Google Stitch, Claude Design, or generic HTML/CSS) dropped into the app, an existing folder/repo, or a **component library** (shadcn/ui, Radix, MUI, Chakra, Ant Design, Mantine, Headless UI, …). For every source, VortSpec SHALL place the real source of truth into the project before component work begins — for a component library this means **provisioning** the library into the configured `component_dir` (running the library's CLI for copy-source libraries, installing + wrapping for package libraries), never recording the choice without provisioning.

#### Scenario: ZIP export dropped into the app

- **WHEN** the user drops a design-export ZIP onto the design-input surface
- **THEN** VortSpec places it at the project's expected input path so the SDD-DE step can consume it

#### Scenario: Figma link provided

- **WHEN** the user provides a Figma link
- **THEN** VortSpec passes it to the Claude Code step, which reaches Figma via the user's configured Figma MCP (VortSpec ships no Figma REST adapter of its own)

#### Scenario: Component library selected

- **WHEN** the user selects a component library as the design source
- **THEN** VortSpec records the library and its provisioning kind, and provisions the real library artifacts into `component_dir` (via the library CLI or install-and-wrap) before component work begins
- **AND** VortSpec SHALL NOT leave the choice recorded but unprovisioned, which would force the pipeline to rebuild the library's components from scratch
