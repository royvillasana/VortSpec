// This support file is transformed with the classic JSX runtime (no governing
// react-jsx tsconfig reaches tests/ct/support), so React must be in scope.
import React from "react";
import type { JSX } from "react";
import { AssistantDock } from "@vortspec/ui/AssistantDock";
import {
  CanvasSelectionProvider,
  usePublishCanvasSelection,
  type CanvasSelection,
} from "@vortspec/ui/canvas-selection";
import { PROJECT } from "./fixtures";

/**
 * Test harness for ambient selection context. Stands in for the canvas: the
 * three buttons publish selections the way `RunApp` does when the user selects /
 * deselects an element, so the ambient-context contract can be driven without a
 * <webview> guest (component tests don't have one).
 *
 * It lives here, imported as a single component, rather than inline in the test —
 * Playwright CT's component-collection transform double-registers a module that a
 * test file and a component-under-test both import, so the provider/hook must not
 * be imported directly by the spec.
 */

/** Marker strings prove what did (and didn't) ride along in the sent prompt. */
export const CARD: CanvasSelection = {
  key: "n1",
  label: "Card",
  payload: "Selected in the Run canvas: Card (component Card) — src/Card.tsx\nAMBIENT_CARD",
};
export const BUTTON: CanvasSelection = {
  key: "n2",
  label: "PrimaryButton",
  payload: "Selected in the Run canvas: PrimaryButton — src/Button.tsx\nAMBIENT_BUTTON",
};

const noop = (): void => {};

function Publishers(): JSX.Element {
  const publish = usePublishCanvasSelection();
  return (
    <div>
      <button type="button" onClick={() => publish(CARD)}>pub card</button>
      <button type="button" onClick={() => publish(BUTTON)}>pub button</button>
      <button type="button" onClick={() => publish(null)}>pub none</button>
      <AssistantDock project={PROJECT} onClose={noop} />
    </div>
  );
}

export function SelectionHarness(): JSX.Element {
  return (
    <CanvasSelectionProvider>
      <Publishers />
    </CanvasSelectionProvider>
  );
}
