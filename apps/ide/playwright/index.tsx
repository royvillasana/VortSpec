import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "../src/renderer/src/styles/globals.css";
// Reuse the cockpit's mock preload bridge so the IDE shell + reused @vortspec/ui
// panels run over the same fixture data without Electron or the main process.
import { installMockVortspec, type MockConfig } from "../../desktop/tests/ct/support/mock-api";

export type HooksConfig = { mock?: MockConfig };

beforeMount<HooksConfig>(async ({ hooksConfig }) => {
  installMockVortspec(hooksConfig?.mock ?? {});
});
