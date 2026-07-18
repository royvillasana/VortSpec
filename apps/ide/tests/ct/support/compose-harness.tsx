// Classic JSX runtime reaches this support file; React must be in scope.
import React from "react";
import type { JSX } from "react";
import { useComposeRun } from "@vortspec/ui/useComposeRun";
import { ComposePanel } from "@vortspec/ui/ComposePanel";
import { makeBridge } from "./mock-bridge";
import type { Project, InspectorComponent, InsertTargetWire } from "@vortspec/core/ipc";

/**
 * Drives the real `useComposeRun` + `ComposePanel` over the mock API (its run
 * returns a fenced JSON result; `composeAccept`/`restoreFiles` are recorded on
 * `window.__composeOps`). A placeholder is injected so the flow can start without
 * a guest. Extract + screen-update callbacks record to `window` for assertions.
 */

const PROJECT = {
  id: "p1",
  name: "acme",
  path: "/tmp/acme",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
} as Project;

const comp = (name: string): InspectorComponent =>
  ({
    name,
    level: "molecule",
    description: `${name} component`,
    file: `src/${name}.tsx`,
    props: [],
    tokens: [],
    status: "built",
    issues: [],
    specPath: null,
    reportPath: null,
  }) as InspectorComponent;

const ROSTER: InspectorComponent[] = [comp("Card"), comp("Button")];

const placeholder = {
  target: {
    anchorFingerprint: "ul>li",
    position: "before",
    axis: "row",
    line: { x1: 0, y1: 0, x2: 0, y2: 40 },
    anchorLabel: "Card",
    anchorText: "Featured",
  } as InsertTargetWire,
  rect: { x: 0, y: 0, width: 220, height: 90 },
};

export function ComposeHarness({ roster = "full" }: { roster?: "full" | "empty" }): JSX.Element {
  const bridge = makeBridge({ placeholder });
  const compose = useComposeRun({
    project: PROJECT,
    bridge,
    roster: roster === "empty" ? [] : ROSTER,
    tokenNames: ["--space-4", "--radius-md"],
    designMd: null,
  });
  return (
    <div style={{ width: 640, height: 360, position: "relative" }}>
      <ComposePanel
        compose={compose}
        onExtract={(name) => {
          (window as unknown as { __extract?: string }).__extract = name ?? "(none)";
        }}
        onScreenUpdate={(file) => {
          (window as unknown as { __screenUpdate?: string }).__screenUpdate = file;
        }}
      />
    </div>
  );
}
