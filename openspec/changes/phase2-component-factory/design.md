## Context

VortSpec has: Figma import (192 components from a design system), ZIP import, IR schemas, tokens, an Inspector with Playground. But the Playground shows raw IR nodes (placeholder boxes) because there's no code generation. The PRD Phase 2 specifies a Component Factory that produces validated code.

The SDD-DE CLI workflow is the model: ask framework → ask style lib → generate code → generate Storybook → review. VortSpec does this through the web UI with the same LLM cascade (OpenRouter, free models first).

## Goals / Non-Goals

**Goals:**
- User configures project: React + Tailwind + shadcn/ui (or other combos)
- One-click "Generate Code" per component → LLM produces component + story
- Playground renders the actual generated component in an iframe
- Generated code uses design tokens (CSS variables / Tailwind classes), not hardcoded values
- Component moves from `normalized` → `validated` after code generation

**Non-Goals:**
- Full execution sandbox (E2B/Fly Machines) — use iframe with Sandpack or similar
- GitHub PR export (Phase 2+ per PRD but separate feature)
- Visual regression testing / adversarial review (simplify to manual verify)
- Multi-file component packages (one file per component for v1)

## Decisions

### 1. Project configuration stored in DB

Add columns to `projects` table:
```sql
ALTER TABLE projects ADD COLUMN framework TEXT DEFAULT 'react';
ALTER TABLE projects ADD COLUMN style_library TEXT DEFAULT 'tailwind';
ALTER TABLE projects ADD COLUMN component_library TEXT DEFAULT 'none';
```

Options:
- **Framework**: `react` | `nextjs` | `vue` | `svelte`
- **Style library**: `tailwind` | `css-modules` | `styled-components`
- **Component library**: `shadcn` | `radix` | `headless-ui` | `none`

### 2. Code generation via LLM

`packages/codegen/` calls the LLM with a structured prompt containing:
- The ComponentIR (structure, variants, props, states)
- The project's design tokens (filtered to those used by this component)
- The target framework + style library
- A system prompt that enforces coding conventions

The LLM returns:
```json
{
  "componentCode": "import React from 'react';\n...",
  "storyCode": "import type { Meta } from '@storybook/react';\n...",
  "typesCode": "export interface ButtonProps { ... }",
  "tokenCSS": ":root { --color-primary-500: #2563EB; ... }"
}
```

Validated by Zod. One retry on failure. Fallback: deterministic template-based codegen (no LLM).

### 3. Code artifacts table

```sql
CREATE TABLE code_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  framework TEXT NOT NULL,
  component_code TEXT NOT NULL,
  story_code TEXT,
  types_code TEXT,
  token_css TEXT,
  llm_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4. Preview rendering via Sandpack

Use [Sandpack](https://sandpack.codesandbox.io/) (CodeSandbox's embeddable sandbox) to render the generated component in the Playground. Sandpack runs in the browser — no server needed.

Setup:
- Inject the generated component code + story code + token CSS into Sandpack
- Sandpack renders it in an iframe with React + Tailwind pre-configured
- User sees the actual rendered component with real styles

Alternative: use a simple iframe with `srcdoc` containing the component rendered as HTML + inline CSS.

### 5. Generation flow

1. User clicks "Generate Code" on a component detail page
2. Server action calls `packages/codegen/generate(componentIR, tokens, projectConfig)`
3. LLM generates code → validated → stored in `code_artifacts`
4. Component status updated to `validated`
5. Playground reloads with the real component preview via Sandpack

### 6. Design token integration in generated code

Generated code references tokens, not hardcoded values:
- **Tailwind**: `className="bg-primary-500 text-white rounded-md px-4 py-2"`
- **CSS Variables**: `style={{ backgroundColor: 'var(--color-primary-500)' }}`
- **CSS Modules**: `.button { background-color: var(--color-primary-500); }`

The `tokenCSS` artifact provides the CSS custom properties that map token names to values.

## Risks / Trade-offs

- **LLM code quality** — Generated code may not compile or look right. Mitigation: Sandpack catches compile errors, user can regenerate.
- **Sandpack bundle size** — ~2MB. Mitigation: lazy-load only on Playground page.
- **Token mapping accuracy** — LLM must correctly reference tokens by name. Mitigation: include token list in prompt with explicit names.
- **Large components** — Components with 10+ variants may exceed LLM context. Mitigation: truncate variant list, generate base + common variants.
