import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "../src/renderer/src/styles/globals.css";
import { installMockVortspec, type MockConfig } from "../tests/ct/support/mock-api";

/** Config a test passes via `mount(<C/>, { hooksConfig })` to seed window.vortspec. */
export type HooksConfig = { mock?: MockConfig };

// Install the stubbed preload bridge before each component mounts, so the views'
// on-mount api calls resolve against fixture data instead of a real main process.
beforeMount<HooksConfig>(async ({ hooksConfig }) => {
  installMockVortspec(hooksConfig?.mock ?? {});
});
