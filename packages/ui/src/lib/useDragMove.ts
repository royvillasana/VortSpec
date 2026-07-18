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
 * The direct-manipulation move flow (change: canvas-direct-manipulation-move).
 *
 * The drop already reparented the element in the live DOM (the guest owns that),
 * so this hook is the Keep/Revert gate over that ephemeral move — mirroring the
 * inspector's ephemeral-edit → gated-commit discipline:
 *
 *   drop → `moved` (instant, no agent) → Keep runs the gated reconcile / Revert undoes.
 *
 * Keep snapshots the source scope, runs the same cut+re-insert move prompt as a
 * single option scaffold, auto-accepts it (the user already approved by keeping),
 * and reloads so source matches the moved DOM. Revert tells the guest to put the
 * element back — nothing was ever written. One move at a time per workspace.
 */
export type MovePhase = "idle" | "moved" | "reconciling" | "error";

export interface UseDragMove {
  phase: MovePhase;
  result: ComposeResult | null;
  /** The latest run activity label while reconciling, or null. */
  progress: string | null;
  error: string | null;
  /** Register the just-dropped (already live-moved) element for Keep/Revert. */
  onDrop: (source: MoveSource, target: InsertTargetWire) => void;
  /** Reconcile source to the moved DOM (gated run + auto-accept). The one action. */
  keep: () => Promise<void>;
  /** Undo the ephemeral move in the live DOM — nothing written. */
  revert: () => void;
  /** Abort an in-flight reconcile: cancel the run, restore the snapshot, revert the DOM. */
  cancel: () => Promise<void>;
  reset: () => void;
}

export function useDragMove(args: { project: Project; bridge: InspectorBridge }): UseDragMove {
  const run = useAgentRun();
  const [phase, setPhase] = useState<MovePhase>("idle");
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs so the callbacks stay stable but read the latest inputs (the bridge is a
  // fresh reference every render).
  const ctx = useRef(args);
  ctx.current = args;
  const snapshotRef = useRef<FileSnapshot[] | null>(null);
  const runIdRef = useRef<string>("");
  // The just-dropped move (already applied in the live DOM), pending Keep/Revert.
  const pendingRef = useRef<{ source: MoveSource; target: InsertTargetWire } | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setError(null);
    snapshotRef.current = null;
    pendingRef.current = null;
    run.reset();
  }, [run]);

  const onDrop = useCallback((source: MoveSource, target: InsertTargetWire) => {
    // The guest already moved the element — just gate it. No agent, no write yet.
    pendingRef.current = { source, target };
    setError(null);
    setResult(null);
    setPhase("moved");
  }, []);

  const revert = useCallback(() => {
    ctx.current.bridge.revertMove();
    reset();
  }, [reset]);

  const keep = useCallback(async () => {
    const { project } = ctx.current;
    const pending = pendingRef.current;
    if (!pending || phase === "reconciling") return;
    const runId = `move-${Date.now()}`;
    runIdRef.current = runId;
    setError(null);

    // Snapshot the WHOLE source scope BEFORE any write (Decision 6): a move's
    // origin/destination is often a screen file outside component_dir, which the
    // narrower token scope would miss. The broad snapshot lets the run touch any
    // source file and still restore exactly if it fails.
    const snap = await api.snapshotSourceScope(project.path);
    snapshotRef.current = snap;

    const built = buildMovePrompt({
      runId,
      source: pending.source,
      sourceFile: null,
      target: {
        anchorLabel: pending.target.anchorLabel ?? "the anchored element",
        anchorText: pending.target.anchorText ?? null,
        position: pending.target.position,
        axis: pending.target.axis,
        file: null,
      },
      snapshotFiles: snap.map((f) => f.path),
    });

    setPhase("reconciling");
    await run.start({
      prompt: built,
      cwd: project.path,
      allowedTools: ["Read", "Edit", "Write"],
      bypassPermissions: true,
      strictMcp: true,
      model: routedModel("sonnet"),
    });
  }, [phase, run]);

  // React to the reconcile run finishing: gate the target, auto-accept, reload.
  useEffect(() => {
    if (phase !== "reconciling") return;
    if (run.model.status === "done") {
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
          `The move finished but didn't return a usable result. Revert and try again.${
            tail ? `\n\nLast output: …${tail}` : ""
          }`,
        );
        setPhase("error");
        return;
      }
      setResult(parsed);
      // The run stopped without writing the move (ambiguous/not-found origin or
      // destination, no container, generated target, or a snapshot-scope escape).
      // The element stays in its moved DOM position pending Revert.
      if (parsed.stopped) {
        const cands = parsed.stopped.candidates.length ? ` Candidates: ${parsed.stopped.candidates.join(", ")}.` : "";
        setError(`${parsed.stopped.reason}${cands}`);
        setPhase("error");
        return;
      }
      const file = parsed.writtenFile;
      if (!file) {
        setError("The move reported no file it wrote into. Revert and try again.");
        setPhase("error");
        return;
      }
      // Refuse a generated/ignored destination (the origin is guarded by the prompt).
      void api.composeCheckTarget(ctx.current.project.path, file).then(async (check) => {
        if (!check.ok) {
          setError(check.reason ?? `${file} is not a file this can safely write to. Revert and try again.`);
          setPhase("error");
          return;
        }
        // The user already approved by keeping — auto-accept (strip the scaffold),
        // forget the ephemeral move, and reload so the DOM reflects real source. Keep
        // is the ONE action: no separate screen-spec "Save changes" prompt for a move
        // (a relocation is a layout tweak; the spec sync isn't worth a second confirm).
        await api.composeAccept(ctx.current.project.path, file, runIdRef.current, 0);
        ctx.current.bridge.clearMove();
        ctx.current.bridge.reload();
        reset();
      });
    } else if (run.model.status === "error") {
      setError(run.model.result?.text ?? "The move run failed. Revert and try again.");
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

  const cancel = useCallback(async () => {
    await run.cancel();
    const { project, bridge } = ctx.current;
    if (snapshotRef.current) await api.restoreFiles(project.path, snapshotRef.current);
    bridge.revertMove(); // undo the ephemeral move too — the user backed all the way out
    bridge.reload();
    reset();
  }, [run, reset]);

  return {
    phase,
    result,
    progress: run.model.activity.at(-1)?.label ?? null,
    error,
    onDrop,
    keep,
    revert,
    cancel,
    reset,
  };
}
