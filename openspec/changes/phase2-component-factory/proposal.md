## Why

Phase 1 produces ComponentIR and DesignTokens in the database — but no code. The Inspector shows raw IR structure (placeholder boxes) instead of real rendered components. Designers can see their tokens and variant axes, but there's no actual React component, no Storybook story, nothing a developer can use.

The CLI (SDD-DE) solves this: it asks the user for framework + style library, then generates production components with Storybook stories. VortSpec needs the same workflow — but through the web UI, not a terminal.

Phase 2 (Component Factory) per the PRD: *"SDD agentic pipeline (spec → implement → visual-verify → adversarial-review); deterministic codegen IR → React + CVA + Tailwind; approved components become `validated` with code artifacts and Storybook stories."*

## What Changes

- **Project setup step**: before import or after first import, user selects:
  - Framework: React / Next.js / Vue / Svelte
  - Style library: Tailwind CSS / CSS Modules / styled-components
  - Component library: shadcn/ui / Radix / Headless UI / none
- **Code generation pipeline**: for each ComponentIR, the LLM (via OpenRouter) generates:
  - Component code (e.g. `Button.tsx`) using the selected framework + style library
  - Design token references (CSS variables or Tailwind classes)
  - Storybook story (`Button.stories.tsx`) showing all variant combinations
  - TypeScript types for props
- **Code artifacts stored in DB**: new `code_artifacts` table links generated code to components
- **Playground renders real code**: iframe rendering the generated component via a sandboxed preview server, replacing the raw IR preview
- **Component status progression**: `imported` → `normalized` → (generate code) → `validated`
- **Regenerate capability**: user can trigger re-generation after editing tokens or variants

## Capabilities

### New Capabilities
- `project-config`: Framework, style library, and component library selection per project
- `code-generation`: LLM-powered component code generation from IR + tokens
- `storybook-stories`: Auto-generated Storybook stories per component
- `code-preview`: Sandboxed iframe preview of generated components in the Playground
- `component-validation`: Status progression from normalized → validated with code

### Modified Capabilities
- `inspector-components`: Playground renders generated code instead of IR preview; "Generate Code" button on component detail
- `import-flow`: After import completes, prompt user to configure project settings if not set

## Impact

- **New DB table**: `code_artifacts` (id, component_id, project_id, framework, code, story_code, types_code, created_at)
- **Modified DB**: `projects` table gets `framework`, `style_library`, `component_library` columns
- **New package**: `packages/codegen/` — LLM-powered code generation from IR
- **Modified**: `apps/web` — project setup UI, Playground overhaul, code preview iframe
- **New**: Preview server or iframe sandbox for rendering generated components
