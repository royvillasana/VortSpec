# Proposal — Component chunking & workspace ergonomics

## Why

The design-system build step and everyday workspace ergonomics have concrete friction:

- **All-or-nothing builds.** "Build the rest" is a single `claude -p` run whose prompt loops one agent over every detected component before returning. With 20–40 components that is a long, expensive, default-model (Opus) run, and nothing is usable until it all finishes.
- **No lightweight routing for repetitive work.** Component implementation is straightforward and repetitive but still runs on the heaviest model.
- **ZIP source is a stub.** The ZIP design-source is a paste-a-path field with a cosmetic drag flag — no file dialog, no working drop.
- **No Home affordance** in the IDE activity bar.
- **No autosave.** Edits persist only on manual Cmd-S; there is no persistent signal of uncommitted/unpushed work and no help writing a commit message.
- **Token usage is under-surfaced.** The token→component index exists but isn't navigable.

## What changes

1. **Chunked builds (chunks of 5) with per-chunk model routing by complexity** (atoms/molecules → Haiku, organisms → Sonnet; never Opus/Fable), regenerating Storybook + the design manifest after each chunk so the first results are usable immediately. Cancelable; resumable.
2. **Real ZIP picker + drag-and-drop** for the design-source surfaces (path captured; the engine extracts).
3. **Home icon** in the IDE activity bar that returns to the homepage.
4. **Debounced disk autosave** + a persistent "N uncommitted · M unpushed — Commit & push" indicator + an auto-drafted, editable commit message. Commit stays a deliberate user action (no auto-commit).
5. **Clickable token where-used** — jump from a token to a consuming component.
6. **Visual refresh + Project Setup screen** from the `claude_design` design — deferred until that design is shared.

## Impact

- Affected specs: `guided-sdd-flow`, `design-input`, `app-shell`, `inspector-tokens`, new `workspace-autosave`.
- Affected code: `packages/core` (`sdd-prompts.ts`, `workspace-manager.ts`, `shared/ipc.ts`, `shared/api.ts`, `preload`), `packages/ui` (`GuidedFlow.tsx`, `Inspector.tsx`, `SourceControl.tsx`, `useWorkspaceFiles.ts`, `DesignInput.tsx`), `apps/ide` (`ActivityBar.tsx`, `App.tsx`), `apps/desktop` (`DesignInput.tsx`).
- No new provider keys, no `--bare`, no re-implemented agent logic. Per-chunk runs drive the user's own `claude` with existing `--model` routing.
