import { createContext, useContext } from "react";

/**
 * Lightweight IDE state shared with the assistant: the file currently open in
 * the editor and the live-preview URL. The AssistantDock is seeded with these
 * so a vibe-engineering request is grounded in what the user is looking at, and
 * a context chip surfaces them so the grounding is transparent.
 */
export interface IdeContextValue {
  activeFile: string | null;
  previewUrl: string | null;
  setActiveFile: (path: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
}

export const IdeContext = createContext<IdeContextValue>({
  activeFile: null,
  previewUrl: null,
  setActiveFile: () => undefined,
  setPreviewUrl: () => undefined,
});

export function useIde(): IdeContextValue {
  return useContext(IdeContext);
}

/** The one-line context string the assistant is seeded with. */
export function buildSeedContext(activeFile: string | null, previewUrl: string | null): string {
  return [
    "Working in the VortSpec IDE.",
    activeFile ? `The open file is ${activeFile}.` : null,
    previewUrl ? `A live preview is running at ${previewUrl}.` : null,
    "When changing code, edit the relevant source directly, keep values token-referenced (never hardcode hex/px), follow the SDD-DE approach (a short spec/plan before implementing a new component or screen), and match the surrounding style. The dev server hot-reloads, so changes appear in the preview.",
  ]
    .filter(Boolean)
    .join(" ");
}
