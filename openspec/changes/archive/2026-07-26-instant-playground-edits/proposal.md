## Why

Manual edits in the Playground are slow because every non-token edit routes through a scoped AI run, gated behind an explicit Apply/Keep/Save, and finished with a full preview reload. The user changes something, then waits for the AI to write code and the dev server to rebuild before they see it "land." Instatic (a visual CMS) proves the opposite is possible: a manipulation updates the page **instantly** (a synchronous in-memory mutation re-renders just that element), and persistence happens **in the background** — no save, no keep, no AI in the edit loop. Its structural ops (insert / move / duplicate / delete) are pure tree operations, never AI. We already proved the deterministic pattern for token edits (a direct file rewrite). This change extends it to the rest of direct manipulation and removes the human-in-the-loop gates, so the Playground feels like Instatic while keeping real component code on disk as the source of truth.

## What Changes

- **Instant, optimistic edits — no Apply/Keep/Save gate.** Every manipulation applies to the live preview immediately and is persisted to source automatically in the background. The explicit Apply/Keep/Save/Revert flow for manual edits is removed; **BREAKING** for that interaction (undo/Ctrl-Z replaces Revert).
- **Deterministic handler ops (no AI).** `insert` (a known component from the picker), `move` across containers, `grab`/reparent, `duplicate`, and `delete` — plus the existing prop/style/variant/text edits — are written to source as **AST codemods**, not AI runs.
- **A single classification rule** routes every edit: **input modality first** (a direct-manipulation handler → deterministic; a language prompt → AI), with a **static resolvability guard** inside the deterministic path. AI is invoked **only** when the user asks in words — never silently.
- **Background persistence** — debounced, dirty-scoped, single-flight source writes (Instatic's autosave shape), so the edit loop never blocks on I/O.
- **Per-element ("island") updates via HMR** — a background write hot-swaps only the touched component through the dev server, instead of a full preview reload.
- **Resolvability fallback** — when a handler op targets JSX that isn't statically resolvable (inside a `.map()`/conditional/HOC), the optimistic visual change still shows, and the user is offered an explicit "ask the assistant" action; the app never auto-runs the AI.

## Capabilities

### New Capabilities
- `instant-canvas-edits`: Optimistic, save-less Playground editing — direct-manipulation handlers write source deterministically via AST codemods with instant visual feedback and background persistence, and a classification rule that reserves the AI strictly for language-expressed intent.

### Modified Capabilities
- `run-canvas`: The manual-edit model becomes optimistic and gate-less — edits apply and persist without an Apply/Keep/Save step; the design panel's manipulation handles drive deterministic source writes.
- `canvas-compose`: Insert from the component picker is a deterministic handler op needing no expressed intent; the intent-gated, AI-driven composition flow narrows to **language-expressed** novel composition only.

## Impact

- **UI**: `packages/ui/src/views/RunApp.tsx` (`applyEdits` → background auto-persist; remove the Apply/Keep/Save gate), `components/run-canvas/pending.ts` (richer optimistic ledger + coalesced undo + dirty set), `compose.ts` (a deterministic `writeBack` per edit kind alongside today's prompt path), the drag/insert/duplicate/delete handlers, and the preview bridge (source anchors + per-island HMR sync).
- **New**: an AST-codemod module (via `ts-morph`/babel) for JSX prop/className/CVA/text writes and structural insert/move/duplicate/delete; a dev-only `data-source="file:line:col"` stamp on rendered elements (React JSX-source transform) so each DOM node has an exact AST anchor; a static resolvability check (is the anchor a direct JSX child, not inside a loop/conditional?).
- **Core**: an IPC surface for deterministic source writes (parallel to `inspector:setTokenValue`), scoped and reversible via the existing snapshot mechanism.
- **Constraint preserved**: real component files on disk stay the source of truth; the AI still owns genuinely novel, language-expressed composition — just off the direct-manipulation path.
