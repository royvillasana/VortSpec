import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useAgentRun } from "./useAgentRun";
import { routedModel } from "./model-routing";
import {
  buildMovePrompt,
  parseComposeResult,
  type ComposeResult,
  type MoveSource,
} from "@vortspec/core/compose-run";
import type { Project, FileSnapshot, InsertTargetWire } from "@vortspec/core/ipc";
import type { InspectorBridge } from "./useInspectorBridge";

/**
 * The drag-move flow (change: canvas-live-structural-editing, §5.6).
 *
 * Mirrors `useComposeRun`, specialized to relocation: a dropped element opens a
 * gated Claude Code run that cuts its JSX from the origin and re-inserts it at the
 * destination as a single `option=0` scaffold (Decision 2), previewed via HMR and
 * accepted (keep option 0) or discarded (restore the snapshot). The snapshot is
 * taken over the token scope BEFORE any write and the move prompt is told to stop
 * rather than edit a file outside that set, so a discard always restores exactly
 * (Decision 6). One move in flight per workspace.
 */
export type MovePhase = "idle" | "moving" | "review" | "error";

export interface UseDragMove {
  phase: MovePhase;
  result: ComposeResult | null;
  /** The latest run activity label while moving, or null. */
  progress: string | null;
  error: string | null;
  /** After an accept, the screen file whose spec now owes a Screen Creation update (§5.9). */
  screenUpdateOwed: string | null;
  /** Begin a gated move of `source` into `target`. No-op if a move is already in flight. */
  start: (source: MoveSource, target: InsertTargetWire) => Promise<void>;
  cancel: () => Promise<void>;
  accept: () => Promise<void>;
  discard: () => Promise<void>;
  clearScreenUpdate: () => void;
  reset: () => void;
}

export function useDragMove(args: { project: Project; bridge: InspectorBridge }): UseDragMove {
  const run = useAgentRun();
  const [phase, setPhase] = useState<MovePhase>("idle");
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screenUpdateOwed, setScreenUpdateOwed] = useState<string | null>(null);

  // Refs so the callbacks stay stable but read the latest inputs (the bridge is a
  // fresh reference every render).
  const ctx = useRef(args);
  ctx.current = args;
  const snapshotRef = useRef<FileSnapshot[] | null>(null);
  const runIdRef = useRef<string>("");

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setError(null);
    snapshotRef.current = null;
    run.reset();
  }, [run]);

  const start = useCallback(
    async (source: MoveSource, target: InsertTargetWire) => {
      const { project } = ctx.current;
      if (phase === "moving") return; // one move in flight per workspace
      const runId = `move-${Date.now()}`;
      runIdRef.current = runId;
      setError(null);
      setResult(null);

      // Snapshot the WHOLE source scope BEFORE any write (Decision 6): a move's
      // origin/destination is often a screen file outside component_dir (e.g.
      // src/App.tsx), which the narrower token scope would miss — the run would then
      // stop on a scope escape. The broad snapshot lets the move touch any source
      // file and still restore exactly on discard.
      const snap = await api.snapshotSourceScope(project.path);
      snapshotRef.current = snap;

      const built = buildMovePrompt({
        runId,
        source,
        sourceFile: null,
        target: {
          anchorLabel: target.anchorLabel ?? "the anchored element",
          anchorText: target.anchorText ?? null,
          position: target.position,
          axis: target.axis,
          file: null,
        },
        snapshotFiles: snap.map((f) => f.path),
      });

      setPhase("moving");
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

  // React to the run finishing: parse, gate the target, preview the moved element.
  useEffect(() => {
    if (phase !== "moving") return;
    if (run.model.status === "done") {
      // The final JSON can land in the result summary, the last assistant message,
      // or the streamed text — search the whole transcript for the last valid block.
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
          `The move finished but didn't return a usable result. Discard and try again.${
            tail ? `\n\nLast output: …${tail}` : ""
          }`,
        );
        setPhase("error");
        return;
      }
      setResult(parsed);
      // The run stopped without moving anything (ambiguous/not-found origin or
      // destination, no container, generated target, or a snapshot-scope escape) —
      // surface its human sentence, offer only discard.
      if (parsed.stopped) {
        const cands = parsed.stopped.candidates.length ? ` Candidates: ${parsed.stopped.candidates.join(", ")}.` : "";
        setError(`${parsed.stopped.reason}${cands}`);
        setPhase("error");
        return;
      }
      const file = parsed.writtenFile;
      if (!file) {
        setError("The move reported no file it wrote into. Discard and try again.");
        setPhase("error");
        return;
      }
      // §5.7 — refuse to accept into a generated/ignored destination the moment the
      // run reports it (the origin is guarded by the prompt's stop clause).
      void api.composeCheckTarget(ctx.current.project.path, file).then((check) => {
        if (!check.ok) {
          setError(check.reason ?? `${file} is not a file this can safely write to. Discard and try again.`);
          setPhase("error");
          return;
        }
        // The relocated element is in real source — preview it in place (option 0).
        ctx.current.bridge.previewOption(0);
        setPhase("review");
      });
    } else if (run.model.status === "error") {
      setError(run.model.result?.text ?? "The move run failed.");
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

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
    bridge.reload();
    reset();
  }, [reset]);

  const accept = useCallback(async () => {
    const { project, bridge } = ctx.current;
    const file = result?.writtenFile;
    if (!file) {
      setError("The move did not report which file it wrote, so it can't be accepted. Discard instead.");
      setPhase("error");
      return;
    }
    await api.composeAccept(project.path, file, runIdRef.current, 0);
    bridge.previewOption(null);
    bridge.reload();
    setScreenUpdateOwed(file); // §5.9 — a relocation changes the screen composition
    reset();
  }, [result, reset]);

  return {
    phase,
    result,
    progress: run.model.activity.at(-1)?.label ?? null,
    error,
    screenUpdateOwed,
    start,
    cancel,
    accept,
    discard,
    clearScreenUpdate: useCallback(() => setScreenUpdateOwed(null), []),
    reset,
  };
}
