// Classic JSX runtime reaches this support file; React must be in scope.
import React from "react";
import type { JSX } from "react";
import { useDragMove } from "@vortspec/ui/useDragMove";
import { MovePanel } from "@vortspec/ui/MovePanel";
import { makeBridge } from "./mock-bridge";
import type { Project, InsertTargetWire } from "@vortspec/core/ipc";

/**
 * Drives the real `useDragMove` + `MovePanel` over the mock API. "Start move"
 * stands in for the guest's live reparent (which is DOM-only, live-session-only):
 * it registers an already-moved element via `onDrop`. Keep runs the gated reconcile
 * (recorded on `window.__composeOps`); Revert/clear/reload record on `__bridgeOps`.
 */

const PROJECT = {
  id: "p1",
  name: "acme",
  path: "/tmp/acme",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const TARGET: InsertTargetWire = {
  anchorFingerprint: "main>section>div#2",
  position: "after",
  axis: "row",
  line: { x1: 120, y1: 0, x2: 120, y2: 60 },
  anchorLabel: "Sidebar",
  anchorText: "Filters",
};

const record = (op: string): void => {
  const w = window as unknown as { __bridgeOps?: string[] };
  (w.__bridgeOps ??= []).push(op);
};

export function MoveHarness(): JSX.Element {
  const bridge = makeBridge({
    revertMove: () => record("revert"),
    clearMove: () => record("clear"),
    reload: () => record("reload"),
    previewOption: () => record("preview"),
  });
  const move = useDragMove({ project: PROJECT, bridge });
  return (
    <div style={{ width: 640, height: 360, position: "relative" }}>
      <button
        type="button"
        onClick={() => move.onDrop({ fingerprint: "fp-card", label: "Card", text: "Featured" }, TARGET)}
      >
        Start move
      </button>
      {(move.phase !== "idle" || move.screenUpdateOwed) && (
        <MovePanel
          move={move}
          onScreenUpdate={(file) => {
            (window as unknown as { __screenUpdate?: string }).__screenUpdate = file;
          }}
          onClose={() => {
            (window as unknown as { __closed?: boolean }).__closed = true;
          }}
        />
      )}
    </div>
  );
}
