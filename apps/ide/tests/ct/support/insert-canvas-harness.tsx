// Classic JSX runtime reaches this support file; React must be in scope.
import React from "react";
import type { JSX } from "react";
import { RunCanvas } from "@vortspec/ui/RunCanvas";
import { DEFAULT_VIEWPORTS } from "@vortspec/ui/viewports";
import type { CanvasMode } from "@vortspec/ui/useInspectorBridge";
import type { InsertTargetWire } from "@vortspec/core/ipc";
import { makeBridge } from "./mock-bridge";

/**
 * Mounts `RunCanvas` over a stub bridge so the insert-mode overlay (line,
 * placeholder, lost-notice) can be exercised in a component test. The guest
 * `<webview>` and its real geometry don't exist in CT, so the bridge state the
 * guest would have produced is injected directly.
 */

const noop = (): void => {};

const rowTarget: InsertTargetWire = {
  anchorFingerprint: "ul>li#2",
  position: "before",
  axis: "row",
  line: { x1: 95, y1: 0, x2: 95, y2: 40 },
};
const columnTarget: InsertTargetWire = {
  anchorFingerprint: "main>div",
  position: "before",
  axis: "column",
  line: { x1: 0, y1: 50, x2: 200, y2: 50 },
};

export type InsertScenario = "line-row" | "line-column" | "placeholder" | "lost" | "interact-hides";

export function InsertCanvasHarness({ scenario }: { scenario: InsertScenario }): JSX.Element {
  const bridge = makeBridge();
  let mode: CanvasMode = "insert";
  switch (scenario) {
    case "line-row":
      bridge.insertTarget = rowTarget;
      break;
    case "line-column":
      bridge.insertTarget = columnTarget;
      break;
    case "placeholder":
      bridge.placeholder = { target: rowTarget, rect: { x: 20, y: 10, width: 120, height: 48 } };
      break;
    case "lost":
      bridge.placeholderLost = "The spot you were composing into changed after a reload — pick the spot again.";
      break;
    case "interact-hides":
      // A stale target is present but the mode is not insert → nothing draws.
      bridge.insertTarget = rowTarget;
      mode = "interact";
      break;
  }
  return (
    <div style={{ width: 640, height: 360 }}>
      <RunCanvas
        src="http://localhost:5173"
        guestPreloadUrl={null}
        bridge={bridge}
        mode={mode}
        onModeChange={noop}
        viewport={DEFAULT_VIEWPORTS.desktop}
        frame="none"
        onViewportChange={noop}
        onFrameChange={noop}
      />
    </div>
  );
}
