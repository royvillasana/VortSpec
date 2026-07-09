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

/**
 * A live text selection in the editor, surfaced to the assistant the way the
 * official Claude Code IDE extension surfaces the active selection: the file,
 * the 1-based line range, and the selected text itself (so the assistant can
 * reason about it without a tool round-trip). `null` means no active selection.
 */
export interface EditorSelection {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

/** Cap on the selected text we inline into the prompt (keeps turns bounded). */
const MAX_SELECTION_CHARS = 2000;

export const IdeContext = createContext<IdeContextValue>({
  activeFile: null,
  previewUrl: null,
  setActiveFile: () => undefined,
  setPreviewUrl: () => undefined,
});

export function useIde(): IdeContextValue {
  return useContext(IdeContext);
}

/**
 * The heavy, once-per-session instruction the assistant is seeded with on the
 * first message. The concrete, changing grounding (which file, which selection)
 * lives in {@link buildLiveContext} so it can ride along on every turn.
 */
export function buildSeedContext(previewUrl: string | null): string {
  return [
    "Working in the VortSpec IDE.",
    previewUrl ? `A live preview is running at ${previewUrl}.` : null,
    "When building or changing UI, ALWAYS prefer the project's existing design-system components (with their variants and tokens) over hand-written markup: check the component library first (the component dir and .sdd-de/components.json) and reuse a component if one fits, using its variant props rather than re-styling. Only write raw markup when no component matches — and if that markup resembles a reusable pattern (button, card, badge, input, etc.), propose extracting it as a new spec-first component instead of duplicating styles, so it stays connected to the design system. When you use a component's root element, keep/emit a data-component=\"Name\" attribute so it is recognizable in the visual editor. Keep values token-referenced (never hardcode hex/px), follow the SDD-DE approach (a short spec/plan before a new component or screen), and match the surrounding style. The dev server hot-reloads, so changes appear in the preview.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The compact, per-turn grounding: the active file and (if any) the selected
 * lines with their text. Prepended to every user message so the assistant
 * always sees what the user is looking at right now — the parity behaviour of
 * the Claude Code extension's active-selection context. Returns `""` when there
 * is nothing to ground on (the caller then sends the message unchanged).
 */
export function buildLiveContext(activeFile: string | null, selection: EditorSelection | null): string {
  if (selection && selection.text.trim()) {
    const snippet =
      selection.text.length > MAX_SELECTION_CHARS
        ? selection.text.slice(0, MAX_SELECTION_CHARS) + "\n… (truncated)"
        : selection.text;
    const range =
      selection.startLine === selection.endLine
        ? `line ${selection.startLine}`
        : `lines ${selection.startLine}–${selection.endLine}`;
    return `[IDE context] In ${selection.path}, I have selected ${range}:\n\`\`\`\n${snippet}\n\`\`\``;
  }
  if (activeFile) return `[IDE context] The open file is ${activeFile}.`;
  return "";
}
