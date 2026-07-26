// Classic JSX runtime reaches this support file; React must be in scope.
import React, { useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { routeEdits } from "@vortspec/ui/edit-plan";
import { createAutoPersist } from "@vortspec/ui/auto-persist";
import { useAgentRun } from "@vortspec/ui/useAgentRun";
import { api } from "@vortspec/ui/api";
import type { Selection } from "@vortspec/core/ipc";
import type { CanvasEdit } from "@vortspec/core/canvas-edit";
import type { PendingEdit } from "@vortspec/ui/pending";

/**
 * Drives the REAL instant-edit routing primitives — `routeEdits` (deterministic vs gated) +
 * `createAutoPersist` (background write) + the mock `api.writeCanvasEdit` — exactly as
 * `RunApp.commitEdits` wires them, plus `useAgentRun` for the language-prompt path. The buttons
 * stand in for Design-panel actions (the guest `<webview>` and its selection don't exist in CT),
 * the same way `move-harness` stands in for the guest's live reparent.
 *
 * Assertions read `window.__canvasWrites` (deterministic writes) and `window.__runPrompts` (AI runs)
 * from the mock, so a test proves: a manual edit persists deterministically with NO AI run and no
 * Apply/Keep gate; an un-writable edit surfaces a fixable notice and still starts no AI; a language
 * prompt routes to the AI path.
 */

const PROJECT_PATH = "/tmp/acme";

/** A stamped selection — has a `data-source` anchor, so edits route to the deterministic lane. */
const STAMPED: Selection = {
  nodeId: "n1",
  label: "h1",
  component: "App",
  file: "src/App.tsx",
  dataSource: "src/App.tsx:8:6",
  listIndex: null,
  resembles: null,
  rect: { x: 0, y: 0, width: 100, height: 20 },
  variants: [],
  sections: [],
} as Selection;

const UNSTAMPED: Selection = { ...STAMPED, dataSource: null };

const base: PendingEdit = { key: "k", id: "n1::k", label: "L", kind: "style", value: "v", token: null, shared: false, cssProps: [] };

export function InstantEditsHarness({ stamped = true }: { stamped?: boolean }): JSX.Element {
  const selection = stamped ? STAMPED : UNSTAMPED;
  const run = useAgentRun();
  const persistQueue = useRef<{ file: string; edit: CanvasEdit }[]>([]);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingEdit[]>([]);

  const autoPersist = useMemo(
    () =>
      createAutoPersist({
        debounceMs: 0,
        persist: async () => {
          const q = persistQueue.current;
          persistQueue.current = [];
          for (const it of q) {
            const r = await api
              .writeCanvasEdit(PROJECT_PATH, it.file, it.edit)
              .catch(() => ({ ok: false as const, reason: "Couldn't write." }));
            if (r && r.ok === false) setWriteError(r.reason ?? "This element can't be edited in place.");
            else setWriteError(null);
          }
        },
      }),
    [],
  );

  // Mirrors RunApp.commitEdits: route into the deterministic lane (background write, no AI) or the
  // gated ledger; token-value edits share the deterministic lane in the real app (omitted here).
  const commit = (edits: PendingEdit[]): void => {
    const { deterministic, ledger } = routeEdits(edits, selection);
    if (deterministic.length > 0) {
      persistQueue.current.push(...deterministic);
      autoPersist.schedule();
    }
    if (ledger.length > 0) setPending((p) => [...p, ...ledger]);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => commit([{ ...base, kind: "style", key: "color", value: "#c53434", css: { color: "#c53434" } }])}
      >
        Change color
      </button>
      <button type="button" onClick={() => commit([{ ...base, remove: true }])}>
        Delete element
      </button>
      <button
        type="button"
        onClick={() =>
          void run.start({ prompt: "make this feel more playful", cwd: PROJECT_PATH, allowedTools: ["Read", "Edit", "Write"] })
        }
      >
        Ask the assistant
      </button>
      {writeError && <p data-testid="write-error">{writeError}</p>}
      {pending.length > 0 && <p data-testid="apply-bar">Apply {pending.length}</p>}
    </div>
  );
}
