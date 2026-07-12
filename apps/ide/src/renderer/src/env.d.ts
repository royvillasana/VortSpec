/// <reference types="vite/client" />
// Brings the `Window.vortspec` global (declared in @vortspec/core/api) into scope.
import "@vortspec/core/api";

// Native menu → renderer bridge, exposed by the IDE preload (`window.vortspecMenu`).
declare global {
  interface MenuCommand {
    command: string;
    path?: string;
  }
  interface Window {
    vortspecMenu?: {
      onCommand: (callback: (payload: MenuCommand) => void) => () => void;
    };
  }
}
