// Classic JSX runtime reaches this support file; React must be in scope.
import React from "react";
import type { JSX } from "react";
import { useDragMove } from "@vortspec/ui/useDragMove";
import { MovePanel } from "@vortspec/ui/MovePanel";
import { makeBridge } from "./mock-bridge";
import type { Project, InsertTargetWire } from "@vortspec/core/ipc";

/**
 * Drives the real `useDragMove` + `MovePanel` over the mock API. A drop is injected
 * by clicking "Start move" (the guest gesture that emits it is live-only), then the
 * gated run resolves via the mock and accept/discard record on `window.__composeOps`.
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

export function MoveHarness(): JSX.Element {
  const bridge = makeBridge();
  const move = useDragMove({ project: PROJECT, bridge });
  return (
    <div style={{ width: 640, height: 360, position: "relative" }}>
      <button
        type="button"
        onClick={() =>
          void move.start({ fingerprint: "fp-card", label: "Card", text: "Featured" }, TARGET)
        }
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
