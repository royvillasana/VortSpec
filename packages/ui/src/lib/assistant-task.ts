import { createContext, useContext } from "react";

/**
 * A unit of work handed off to the right-sidebar assistant — an error to fix or
 * a problem to resolve, surfaced from anywhere in the IDE (a failed health
 * check, a broken run, a fix-it card). Dispatching one opens the assistant,
 * starts a **fresh conversation** seeded with `prompt` that auto-runs, and lets
 * the user leave the current screen while it streams. When the run finishes the
 * dock points them back to where they were.
 *
 * The host (the IDE shell) owns "where they were" — it captures the active view
 * at dispatch time — so callers only describe the work, not the navigation.
 */
export interface AssistantTask {
  /** Short label for the conversation tab (e.g. "Fix: Figma connection"). */
  title: string;
  /** The seed prompt that auto-starts the assistant run. */
  prompt: string;
  /** Whether the run may edit files / run tools. Defaults to true — a fix acts. */
  allowModify?: boolean;
}

export type DispatchAssistantTask = (task: AssistantTask) => void;

const AssistantTaskCtx = createContext<DispatchAssistantTask | null>(null);

/** Provided by the IDE shell (which hosts the assistant dock). */
export const AssistantTaskProvider = AssistantTaskCtx.Provider;

/**
 * The dispatcher, or `null` when no assistant host is mounted (e.g. the cockpit
 * app, or a standalone component render) — callers fall back to their own inline
 * fix-it affordance when this is null.
 */
export function useAssistantTask(): DispatchAssistantTask | null {
  return useContext(AssistantTaskCtx);
}
