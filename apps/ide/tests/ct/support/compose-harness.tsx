// Classic JSX runtime reaches this support file; React must be in scope.
import React from "react";
import type { JSX } from "react";
import { useComposeRun } from "@vortspec/ui/useComposeRun";
import { ComposePanel } from "@vortspec/ui/ComposePanel";
import { DesignPanel } from "@vortspec/ui/DesignPanel";
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

export function ComposeHarness({
  roster = "full",
  storyUrl,
}: {
  roster?: "full" | "empty";
  /** A fake Storybook URL builder for the preview iframe (tests pass a fixed URL). */
  storyUrl?: string;
}): JSX.Element {
  const bridge = makeBridge({ placeholder });
  const compose = useComposeRun({
    project: PROJECT,
    bridge,
    roster: roster === "empty" ? [] : ROSTER,
    tokenNames: ["--space-4", "--radius-md"],
    designMd: null,
  });
  // Mirror RunApp: "Later" defers an owed screen-spec update to the sidebar bar.
  const [owed, setOwed] = React.useState<string[]>([]);
  return (
    <div style={{ width: 640, height: 360, position: "relative", display: "flex" }}>
      <div style={{ width: 240 }}>
        <DesignPanel
          selection={null}
          tree={null}
          onSelectNode={() => {}}
          owedScreenUpdates={owed}
          onSaveScreenUpdates={() => {
            (window as unknown as { __savedUpdates?: string[] }).__savedUpdates = owed;
            setOwed([]);
          }}
          onDismissScreenUpdate={(file) => setOwed((cur) => cur.filter((f) => f !== file))}
        />
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <ComposePanel
          compose={compose}
          components={roster === "empty" ? [] : ROSTER}
          onExtract={(name) => {
            (window as unknown as { __extract?: string }).__extract = name ?? "(none)";
          }}
          onScreenUpdate={(file) => {
            (window as unknown as { __screenUpdate?: string }).__screenUpdate = file;
          }}
          onScreenLater={(file) => setOwed((cur) => (cur.includes(file) ? cur : [...cur, file]))}
          onClose={() => {
            (window as unknown as { __closed?: boolean }).__closed = true;
          }}
          getStoryUrl={storyUrl ? (name) => `${storyUrl}?c=${name}` : undefined}
        />
      </div>
    </div>
  );
}
