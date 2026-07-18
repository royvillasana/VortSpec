import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useAgentRun } from "./useAgentRun";
import { routedModel } from "./model-routing";
import {
  buildComposePrompt,
  parseComposeResult,
  hasUsableRoster,
  type ComposeResult,
  type InsertSpec,
} from "@vortspec/core/compose-run";
import type { Project, InspectorComponent, FileSnapshot } from "@vortspec/core/ipc";
import type { InspectorBridge } from "./useInspectorBridge";

/**
 * The composition-run flow (change: canvas-compose-and-preview-bar, §6.5–6.15).
 *
 * Drives the state machine behind the insert placeholder: gate on an expressed
 * intent, snapshot, run the roster-grounded prompt with a gated toolset, parse the
 * result, preview options in place, and accept (keep one) or discard (restore).
 * One run in flight at a time; cancel and discard both restore the snapshot so the
 * scaffold never survives.
 */
export type ComposePhase = "idle" | "generating" | "options" | "no-match" | "error";

export interface UseComposeRun {
  phase: ComposePhase;
  /** True once the roster can support a run (§6.4) — else the panel shows a next step. */
  hasRoster: boolean;
  result: ComposeResult | null;
  /** Which option is previewed/selected for accept. */
  activeOption: number;
  /** The latest run activity label, while generating (§6.12). */
  progress: string | null;
  error: string | null;
  /** After an accept, the screen file whose spec now owes a Screen Creation update (§6.15). */
  screenUpdateOwed: string | null;
  generate: (prompt: string, preferredComponents?: string[], insertSpec?: InsertSpec) => Promise<void>;
  cancel: () => Promise<void>;
  accept: () => Promise<void>;
  discard: () => Promise<void>;
  selectOption: (i: number) => void;
  clearScreenUpdate: () => void;
  reset: () => void;
}

export function useComposeRun(args: {
  project: Project;
  bridge: InspectorBridge;
  roster: InspectorComponent[];
  tokenNames: string[];
  designMd: string | null;
}): UseComposeRun {
  const run = useAgentRun();
  const [phase, setPhase] = useState<ComposePhase>("idle");
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [activeOption, setActiveOption] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [screenUpdateOwed, setScreenUpdateOwed] = useState<string | null>(null);

  // Refs so the action callbacks stay stable but always read the latest inputs
  // (the bridge object is a fresh reference every render).
  const ctx = useRef(args);
  ctx.current = args;
  const snapshotRef = useRef<FileSnapshot[] | null>(null);
  const runIdRef = useRef<string>("");

  const hasRoster = hasUsableRoster(args.roster);

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setActiveOption(0);
    setError(null);
    snapshotRef.current = null;
    run.reset();
  }, [run]);

  const generate = useCallback(
    async (prompt: string, preferredComponents: string[] = [], insertSpec?: InsertSpec) => {
      const { project, bridge, roster, tokenNames, designMd } = ctx.current;
      // Creating a NEW row/column container is structural — it needs neither a roster
      // nor an intent (an empty band is valid). Filling an existing gap still needs
      // both: one run in flight (§6.6), a non-empty roster (§6.4), and an intent (§6.5).
      const newContainer = !!insertSpec && insertSpec.placement !== "into-existing";
      if (phase === "generating" || !bridge.placeholder) return;
      if (!newContainer && (!hasUsableRoster(roster) || !prompt.trim())) return;
      const target = bridge.placeholder.target;
      const rect = bridge.placeholder.rect;
      const runId = `compose-${Date.now()}`;
      runIdRef.current = runId;
      setError(null);

      // Snapshot the whole source scope BEFORE any write, so discard/cancel restores
      // exactly — the run resolves the slot's file itself, so we can't pre-scope it.
      const snap = await api.snapshotTokenScope(project.path);
      snapshotRef.current = snap;

      const built = buildComposePrompt({
        runId,
        roster,
        tokens: tokenNames,
        designMd,
        intent: prompt,
        preferredComponents,
        insertSpec,
        slot: {
          anchorLabel: target.anchorLabel ?? "the anchored element",
          anchorText: target.anchorText ?? null,
          position: target.position,
          axis: target.axis,
          file: null,
        },
        sizeHint: { width: Math.round(rect.width), height: Math.round(rect.height) },
        count: 3,
      });

      setPhase("generating");
      await run.start({
        prompt: built,
        cwd: project.path,
        allowedTools: ["Read", "Edit", "Write"],
        bypassPermissions: true,
        strictMcp: true,
        model: routedModel("sonnet"),
      });
    },
    [phase, run],
  );

  // React to the run finishing (§6.11): parse the result, preview options in place.
  useEffect(() => {
    if (phase !== "generating") return;
    if (run.model.status === "done") {
      // The run's final JSON can land in the result summary, the last assistant
      // message, or the streamed text — a multi-step run doesn't always echo it into
      // `result.text`. Search the whole transcript for the last valid block.
      const transcript = [
        ...run.model.messages.filter((m) => m.role === "assistant").map((m) => m.text),
        run.model.streamingText,
        run.model.result?.text ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const parsed = parseComposeResult(transcript);
      if (!parsed) {
        const tail = transcript.trim().slice(-200);
        setError(
          `The composition run finished but didn't return a usable result. Discard and try again.${
            tail ? `\n\nLast output: …${tail}` : ""
          }`,
        );
        setPhase("error");
        return;
      }
      setResult(parsed);
      // The run stopped without placing anything (ambiguous / not-found anchor, or a
      // generated target) — surface its human sentence, offer only discard (§6.9).
      if (parsed.stopped) {
        const cands = parsed.stopped.candidates.length ? ` Candidates: ${parsed.stopped.candidates.join(", ")}.` : "";
        setError(`${parsed.stopped.reason}${cands}`);
        setPhase("error");
        return;
      }
      if (parsed.noMatch) {
        setPhase("no-match");
        return;
      }
      // §6.8 — refuse to accept into a generated/untracked file. Check the target the
      // moment the run reports it, so the user is never offered accept there.
      const file = parsed.writtenFile;
      if (!file) {
        setError("The run reported options but not which file it wrote them into. Discard and try again.");
        setPhase("error");
        return;
      }
      void api.composeCheckTarget(ctx.current.project.path, file).then((check) => {
        if (!check.ok) {
          setError(check.reason ?? `${file} is not a file this can safely write to. Discard and try again.`);
          setPhase("error");
          return;
        }
        // The options are now in real source — drop the placeholder and preview the
        // first one in place (the dev server hot-reloaded the scaffold).
        ctx.current.bridge.dismissPlaceholder();
        setActiveOption(0);
        ctx.current.bridge.previewOption(0);
        setPhase("options");
      });
    } else if (run.model.status === "error") {
      setError(run.model.result?.text ?? "The composition run failed.");
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

  const selectOption = useCallback((i: number) => {
    setActiveOption(i);
    ctx.current.bridge.previewOption(i);
  }, []);

  const cancel = useCallback(async () => {
    await run.cancel();
    const { project, bridge } = ctx.current;
    if (snapshotRef.current) await api.restoreFiles(project.path, snapshotRef.current);
    bridge.previewOption(null);
    bridge.reload();
    reset();
  }, [run, reset]);

  const discard = useCallback(async () => {
    const { project, bridge } = ctx.current;
    if (snapshotRef.current) await api.restoreFiles(project.path, snapshotRef.current);
    bridge.previewOption(null);
    bridge.dismissPlaceholder();
    bridge.reload();
    reset();
  }, [reset]);

  const accept = useCallback(async () => {
    const { project, bridge } = ctx.current;
    const file = result?.writtenFile;
    if (!file) {
      setError("The run did not report which file it wrote, so it can't be accepted. Discard instead.");
      setPhase("error");
      return;
    }
    await api.composeAccept(project.path, file, runIdRef.current, activeOption);
    bridge.previewOption(null);
    bridge.dismissPlaceholder();
    bridge.reload();
    setScreenUpdateOwed(file); // §6.15 — inform, don't block
    reset();
  }, [result, activeOption, reset]);

  return {
    phase,
    hasRoster,
    result,
    activeOption,
    progress: run.model.activity.at(-1)?.label ?? null,
    error,
    screenUpdateOwed,
    generate,
    cancel,
    accept,
    discard,
    selectOption,
    clearScreenUpdate: useCallback(() => setScreenUpdateOwed(null), []),
    reset,
  };
}
