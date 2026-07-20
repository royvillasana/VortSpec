## Why

Built design systems keep rendering as **unstyled skeletons in Storybook**, and Storybook keeps **failing to build** — the same failure recurs project after project. Root-causing a real run (`20JulyProject`, a 57-component Bootstrap-derived Figma system) found two independent, deterministic causes that nothing in the flow guarantees away before the user reaches Storybook/Playground:

1. **The Tailwind pipeline is never bootstrapped.** With `styling: tailwind`, the components use design-token utility classes (`bg-brand-primary`, `text-default`, `text-body-regular-size`), but the project has **no `tailwind.config`, no `postcss.config`, and no `@tailwind` entry CSS** — so every utility class compiles to nothing. The token *variables* load; nothing references them. Even a bare config isn't enough: the token classes only resolve if the config **maps every token into the Tailwind theme**, which no step generates.
2. **Inconsistent export conventions break the build.** Components mix `export default` and named exports, and the generated stories + sibling-component imports guess the wrong shape (`icon.tsx` exports default, its story imports `{ Icon }`; `button.tsx` exports default, three components import `{ Button }`). Storybook fails with `MISSING_EXPORT`, and — because the compile/build check runs *after* the Storybook step — the user hits it at the worst moment.

The fix that unblocked `20JulyProject` (generate the config/postcss/entry-css + a token→theme bridge, reconcile the export/import shapes, then build) should be **guaranteed by the flow up front**, not hand-applied after the fact. VortSpec already provisions Storybook deterministically (`ensureStorybook`); the styling pipeline and a compile gate deserve the same treatment, and must run **before** the Storybook/Playground step.

## What Changes

- **Deterministic styling foundation**: a new provisioning step (mirroring `ensureStorybook`) that, for `styling: tailwind`, ensures `tailwind.config` + `postcss.config` + a `@tailwind` entry CSS exist, the Storybook preview imports it, and `postcss`/`autoprefixer` are installed — **before the first component build and before Storybook**.
- **Token → Tailwind theme bridge**: the config maps the project's design tokens (from `tokens.css`) into the Tailwind theme so token utility classes actually resolve. The `extract-design-system` / `sync-tokens` methodology emits this bridge alongside `tokens.css`.
- **Export-convention consistency**: the methodology mandates one component export convention; `/storybook` and cross-component imports are generated to match, and a reconciler repairs existing default-vs-named mismatches.
- **Gate ordering**: the compile/build check (`tsc --noEmit`, `build-storybook`) runs **ahead of** the Storybook/Playground step, so a broken build or unstyled pipeline is surfaced and fixed first — never after the user is told it's ready.

## Capabilities

### New Capabilities
- `styling-foundation`: deterministic provisioning of the styling pipeline for the configured `styling` (Tailwind first) — config, postcss, entry CSS, preview import, required deps, and the token→theme bridge — run before build/Storybook so components render styled from the first render.
- `export-convention-consistency`: one enforced component export convention, with generation and a reconciler that keeps stories and cross-component imports matching each module's actual exports.

### Modified Capabilities
- `guided-sdd-flow`: the flow provisions the styling foundation and runs the compile/build gate **before** the Storybook/Playground step (today Storybook is provisioned but styling and compile are not gated ahead of it).

## Impact

- `packages/core/src/main/workspace/` — new `styling-setup.ts` (alongside `storybook-setup.ts`) + the token→theme-bridge generator; `api.ts`/`ipc.ts`/`preload` for an `ensureStylingPipeline` IPC.
- `packages/ui/src/views/GuidedFlow.tsx` (and `RunApp.tsx`) — call the styling foundation before builds/Storybook; reorder the compile gate ahead of the Storybook/Playground step.
- `@royvillasana/sdd-de` — `extract-design-system`/`sync-tokens` emit the tailwind theme bridge; `component-standards.md` mandates the export convention; `/storybook` generates matching imports.
- Depends on the project's `tokens.css` and `.sdd-de/project.yaml` (`styling`, `token_file`, `component_dir`).
- macOS-first, consistent with existing setup code; package-manager detection (npm/pnpm/yarn) for the dep install.
