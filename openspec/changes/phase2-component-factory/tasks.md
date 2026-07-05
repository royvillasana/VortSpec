## 1. Database Schema

- [x] 1.1 Add `framework`, `style_library`, `component_library` columns to `projects` table (SQL migration)
- [x] 1.2 Create `code_artifacts` table: id, component_id, project_id, framework, component_code, story_code, types_code, token_css, llm_model, created_at
- [x] 1.3 Add RLS policies for `code_artifacts` table

## 2. Project Configuration UI

- [x] 2.1 Create project config page at `/projects/[id]/configure`: framework picker (React/Next.js/Vue/Svelte), style library picker (Tailwind/CSS Modules/styled-components), component library picker (shadcn/Radix/Headless UI/none)
- [x] 2.2 Server action `saveProjectConfig(projectId, framework, styleLibrary, componentLibrary)`
- [x] 2.3 After import completes, redirect to config page (instead of straight to Inspector)
- [x] 2.4 After config saved, show "Generate Components" button that triggers batch code generation
- [x] 2.5 Display current config in nav rail under project name

## 3. Code Generation Package

- [x] 3.1 Create `packages/codegen/` with package.json (deps: @vortspec/ir, @vortspec/llm, zod)
- [x] 3.2 Create `src/prompts/system.ts` — base system prompt enforcing clean code, token references, TypeScript
- [x] 3.3 Create `src/prompts/react-tailwind.ts` — React + Tailwind prompt template
- [x] 3.4 Create `src/prompts/storybook.ts` — Storybook story generation prompt
- [x] 3.5 Create `src/generate.ts` — main function: ComponentIR + tokens + config → LLM → { componentCode, storyCode, typesCode, tokenCSS }
- [x] 3.6 Define Zod schema for LLM code generation response
- [x] 3.7 Deterministic fallback: template-based codegen when LLM fails
- [x] 3.8 Create `src/token-css.ts` — generate CSS custom properties from DesignToken[]
- [x] 3.9 Export barrel `src/index.ts`

## 4. Batch Code Generation Flow

- [x] 4.1 Create `apps/web/src/lib/data/codegen.ts` — server action `generateAllComponents(projectId)`
- [x] 4.2 For each ComponentIR in the project: fetch IR + tokens, call codegen, store in code_artifacts
- [x] 4.3 Progress UI: show generation progress (N/M components generated)
- [x] 4.4 Update each component status to `validated` after code generated
- [x] 4.5 Server action `getCodeArtifact(componentId)` — fetch generated code
- [x] 4.6 Server action `regenerateCode(componentId)` — regenerate single component

## 5. Components Page (Code View, not Inspector)

- [x] 5.1 Install `@codesandbox/sandpack-react` in apps/web
- [x] 5.2 Redesign Components page: show generated components as cards with live Sandpack previews
- [x] 5.3 Component detail: Sandpack iframe showing the rendered component with token CSS
- [x] 5.4 Code viewer tabs below preview (Component / Story / Types / Token CSS) with syntax highlighting
- [x] 5.5 "Copy" button per code tab
- [x] 5.6 Variant controls above preview that update Sandpack props
- [x] 5.7 "Regenerate" button per component
- [x] 5.8 If no code generated yet, show "Configure & Generate" CTA

## 6. Nav + Flow Updates

- [x] 6.1 Update nav rail: Inspector section shows only Tokens. Components section shows generated code.
- [x] 6.2 After import: flow is Import → Config → Generate → Components (code) + Tokens (inspector)
- [x] 6.3 Update StatusChip for `validated` status
- [x] 6.4 Breadcrumb on component detail: show framework badge + "Regenerate" button

## 7. Integration + Token Fix

- [x] 7.1 Fix Figma variable extraction: ensure variables become usable tokens with resolved values
- [x] 7.2 Fix token display: all tokens show human-readable values
- [x] 7.3 End-to-end: import → configure → generate → preview in Sandpack
- [x] 7.4 Verify `pnpm build && pnpm test` all green
