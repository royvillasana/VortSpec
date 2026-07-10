import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "../src/renderer/src/styles/globals.css";
// Reuse the cockpit's mock preload bridge so the IDE shell + reused @vortspec/ui
// panels run over the same fixture data without Electron or the main process.
import { installMockVortspec, FOUNDED_TOKENS, type MockConfig } from "../../desktop/tests/ct/support/mock-api";

export type HooksConfig = { mock?: MockConfig };

beforeMount<HooksConfig>(async ({ hooksConfig }) => {
  // Isolate persisted UI state (the layout store, preview toggles) between tests
  // so one test's region changes don't leak into the next.
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  // IDE projects default to a "founded" design system (has tokens) so opening one
  // lands on the Explorer. The IDE auto-routes un-founded projects to the Flow/
  // foundation — a test opts into that by setting `tokens` to an empty result.
  installMockVortspec({ tokens: FOUNDED_TOKENS, ...(hooksConfig?.mock ?? {}) });
});
