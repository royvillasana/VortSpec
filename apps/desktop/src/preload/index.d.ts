import type { VortSpecApi } from "./index";

declare global {
  interface Window {
    vortspec: VortSpecApi;
  }
}

export {};
