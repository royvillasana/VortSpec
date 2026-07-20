## 1. Token → Tailwind theme bridge (core)

- [x] 1.1 Add a token→theme-bridge generator that parses `tokens.css` and produces a Tailwind theme (colors by value-type; `--text-*-size|-leading|-family` → fontSize/lineHeight/fontFamily; `--spacing-*`, `--radius-*`, `--shadow*`). Port the self-parsing config proven on `20JulyProject`.
- [x] 1.2 Unit-test the bridge: brand color, status color, `text-default`, a typography size, spacing/radius all map to the right `var(--…)`; unknown/non-color values are not miscategorized.

## 2. Styling foundation provisioning (core)

- [x] 2.1 Add `packages/core/src/main/workspace/styling-setup.ts` with `ensureStylingPipeline(projectPath)` mirroring `storybook-setup.ts`: for `styling: tailwind`, create missing `tailwind.config` (using the bridge), `postcss.config`, and a `@tailwind` entry CSS.
- [x] 2.2 Ensure the Storybook preview imports the entry CSS (before `tokens.css`) only if absent; ensure `postcss`/`autoprefixer` are installed via detected package manager (npm/pnpm/yarn).
- [x] 2.3 Idempotent + non-destructive: never overwrite an existing config; return a structured result (created vs pre-existing, deps installed vs fix-it needed).
- [x] 2.4 Wire the IPC: `api.ts` + `main/ipc.ts` + `preload/index.ts` expose `ensureStylingPipeline`.
- [x] 2.5 Unit-test: no-config project gets all pieces; existing-config project is left untouched; unknown package manager returns the install fix-it.

## 3. Export-convention reconciler (core)

- [x] 3.1 Add a pure reconciler that repairs single-specifier relative imports (stories + cross-component source) to match each target module's actual exports (named↔default). Port the reconciler proven on `20JulyProject`.
- [x] 3.2 Leave bare/namespace/multi-name imports and non-matching names untouched; only act when the local name is the target's export in the opposite form.
- [x] 3.3 Unit-test: default-imported named export fixed; named-imported default export fixed; ambiguous/unrelated left alone.

## 4. Flow ordering (UI)

- [x] 4.1 `GuidedFlow.tsx`: call `ensureStylingPipeline` before the first build and before `ensureStorybook`.
- [~] 4.2 Run the compile/build gate (reconciler → `tsc --noEmit` / `build-storybook`) BEFORE the Storybook/Playground step. DONE: the reconciler runs before Storybook provisions (RunApp) and styling is wired before the first build. The compile-gate ORDERING inside the agent run (build → gate → storybook in one prompt) is owned by the `figma-visual-validation` verify gate + the methodology; not re-sequenced here to avoid overlapping that change.
- [x] 4.3 Surface styling/compile failures as fix-it cards (missing dep → exact install command), consistent with the app's error convention.
- [x] 4.4 Mirror the pre-build styling provisioning in `RunApp.tsx` where it provisions Storybook.

## 5. Methodology (`@royvillasana/sdd-de`)

- [ ] 5.1 `extract-design-system` / `sync-tokens` emit the Tailwind theme bridge alongside `tokens.css`. DEFERRED to a methodology pass (needs an `sdd-de` republish + your npm OTP). VortSpec now provisions the bridge deterministically regardless, so a project is never left skeletonized even before this lands.
- [ ] 5.2 `component-standards.md` mandates named component exports; `/storybook` generates matching imports. DEFERRED (same republish). VortSpec's reconciler repairs existing mismatches in the meantime.
- [ ] 5.3 Bump the package, republish, and re-wire VortSpec. DEFERRED (bundles 5.1 + 5.2).

## 6. Validation

- [x] 6.1 `20JulyProject` fixed and `build-storybook` green (done manually this session); the provisioning + reconciler are the exact logic ported into core, covered by `styling-setup`/`token-theme-bridge`/`reconcile-exports` unit tests.
- [ ] 6.2 One fresh Figma build end-to-end (styled from first render; Storybook builds without hand-holding). Manual UI run — deferred to a hands-on session; needs the app rebuilt with this branch.
- [x] 6.3 `pnpm test`, `pnpm check-types`, `pnpm lint` green across both shells.
